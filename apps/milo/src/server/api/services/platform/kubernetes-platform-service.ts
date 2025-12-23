import {
	BatchV1Api,
	CoreV1Api,
	KubeConfig,
	type V1EnvVar,
	type V1Job,
} from "@kubernetes/client-node";

import { env } from "@/env";
import type { BotConfig } from "@/server/database/schema";
import { K8sStatusMapper } from "./mappers/k8s-status-mapper";
import type {
	PlatformDeployWithQueueResult,
	PlatformService,
} from "./platform-service";

/**
 * Kubernetes job status values (UPPERCASE convention)
 */
export type K8sBotStatus = "PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED";

/**
 * Configuration for Kubernetes platform
 */
export interface KubernetesPlatformConfig {
	/** Namespace for bot Jobs */
	namespace: string;

	/** Container image registry (e.g., ghcr.io/payme-works) */
	imageRegistry: string;

	/** Image tag to use (e.g., latest) */
	imageTag: string;

	/** Path to kubeconfig file (optional, uses in-cluster or default if not set) */
	kubeconfigPath?: string;

	/** CPU request per bot (e.g., 250m) */
	cpuRequest: string;

	/** CPU limit per bot (e.g., 500m) */
	cpuLimit: string;

	/** Memory request per bot (e.g., 768Mi) */
	memoryRequest: string;

	/** Memory limit per bot (e.g., 1Gi) */
	memoryLimit: string;
}

/**
 * Environment configuration passed to bot containers
 */
export interface KubernetesBotEnvConfig {
	miloUrl: string;
	miloAuthToken: string;
	s3Endpoint: string;
	s3AccessKey: string;
	s3SecretKey: string;
	s3BucketName: string;
	s3Region: string;
}

/**
 * Extended Job information including pods and events.
 * Uses plain objects instead of K8s class instances for proper JSON serialization.
 */
export interface KubernetesJob {
	job: Record<string, unknown>;
	pods: Record<string, unknown>[];
	events: Record<string, unknown>[];
}

/**
 * Converts K8s client class instances to plain JSON objects.
 * Required because @kubernetes/client-node returns class instances
 * that don't serialize correctly through tRPC.
 */
function toPlainObject(obj: unknown): Record<string, unknown> {
	return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
}

/**
 * Converts an array of K8s client class instances to plain JSON objects.
 */
function toPlainObjectArray(obj: unknown[]): Record<string, unknown>[] {
	return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>[];
}

/**
 * Kubernetes platform service implementation
 *
 * Uses Kubernetes Jobs to run bot containers on-demand.
 * Each bot deployment creates a new Job that runs until completion.
 * Jobs auto-delete after 5 minutes via TTL (ttlSecondsAfterFinished).
 *
 * Similar to AWS ECS - ephemeral, no pool concept.
 */
export class KubernetesPlatformService
	implements PlatformService<K8sBotStatus>
{
	readonly platformName = "k8s" as const;

	private batchApi: BatchV1Api;
	private coreApi: CoreV1Api;

	constructor(
		private readonly config: KubernetesPlatformConfig,
		private readonly botEnvConfig: KubernetesBotEnvConfig,
	) {
		const kc = new KubeConfig();

		// Load kubeconfig: in-cluster, from file, or default
		if (process.env.KUBERNETES_SERVICE_HOST) {
			kc.loadFromCluster();
		} else if (config.kubeconfigPath) {
			kc.loadFromFile(config.kubeconfigPath);
		} else {
			kc.loadFromDefault();
		}

		this.batchApi = kc.makeApiClient(BatchV1Api);
		this.coreApi = kc.makeApiClient(CoreV1Api);
	}

	async deployBot(
		botConfig: BotConfig,
	): Promise<PlatformDeployWithQueueResult> {
		const jobName = this.buildJobName(botConfig.id);
		const job = this.buildJobSpec(botConfig, jobName);

		try {
			await this.batchApi.createNamespacedJob({
				namespace: this.config.namespace,
				body: job,
			});

			console.log(
				`[KubernetesPlatform] Bot ${botConfig.id} deployed as job ${jobName}`,
			);

			return {
				success: true,
				identifier: jobName,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			console.error(
				`[KubernetesPlatform] Failed to deploy bot ${botConfig.id}:`,
				error,
			);

			return {
				success: false,
				error: `Kubernetes Job creation failed: ${errorMessage}`,
			};
		}
	}

	async stopBot(identifier: string): Promise<void> {
		try {
			await this.batchApi.deleteNamespacedJob({
				name: identifier,
				namespace: this.config.namespace,
				propagationPolicy: "Foreground",
			});

			console.log(`[KubernetesPlatform] Stopped job ${identifier}`);
		} catch (error) {
			// Ignore 404 errors (job already deleted)
			if (this.isNotFoundError(error)) {
				console.log(`[KubernetesPlatform] Job ${identifier} already deleted`);

				return;
			}

			console.error(
				`[KubernetesPlatform] Failed to stop job ${identifier}:`,
				error,
			);

			throw error;
		}
	}

	async getBotStatus(identifier: string): Promise<K8sBotStatus> {
		try {
			const response = await this.batchApi.readNamespacedJobStatus({
				name: identifier,
				namespace: this.config.namespace,
			});

			return K8sStatusMapper.toDomain(response.status);
		} catch (error) {
			if (this.isNotFoundError(error)) {
				// Job was deleted or TTL-expired - this is expected
				return "FAILED";
			}

			console.error(
				`[KubernetesPlatform] Failed to get status for job ${identifier}:`,
				error,
			);

			return "FAILED";
		}
	}

	async releaseBot(_botId: number): Promise<void> {
		// K8s Jobs are ephemeral with TTL auto-cleanup
		// Nothing to release - the job will auto-delete after completion
		console.log(
			`[KubernetesPlatform] Release called for bot ${_botId} (no-op for K8s Jobs)`,
		);
	}

	async processQueue(): Promise<void> {
		// K8s doesn't have a queue concept
		// Jobs are created on-demand, K8s scheduler handles resource allocation
	}

	/**
	 * Gets detailed information about a Job including pods and events
	 * Used for observability in the frontend
	 */
	async getJob(jobName: string): Promise<KubernetesJob | null> {
		try {
			const job = await this.batchApi.readNamespacedJob({
				name: jobName,
				namespace: this.config.namespace,
			});

			const podList = await this.coreApi.listNamespacedPod({
				namespace: this.config.namespace,
				labelSelector: `job-name=${jobName}`,
			});

			const eventList = await this.coreApi.listNamespacedEvent({
				namespace: this.config.namespace,
				fieldSelector: `involvedObject.name=${jobName}`,
			});

			return {
				job: toPlainObject(job),
				pods: toPlainObjectArray(podList.items),
				events: toPlainObjectArray(eventList.items),
			};
		} catch (error) {
			if (this.isNotFoundError(error)) {
				return null;
			}

			throw error;
		}
	}

	/**
	 * Gets logs from the bot container
	 */
	async getPodLogs(jobName: string): Promise<string> {
		try {
			const podList = await this.coreApi.listNamespacedPod({
				namespace: this.config.namespace,
				labelSelector: `job-name=${jobName}`,
			});

			if (podList.items.length === 0) {
				return "No pods found for job";
			}

			const podName = podList.items[0].metadata?.name;

			if (!podName) {
				return "Pod name not found";
			}

			const logs = await this.coreApi.readNamespacedPodLog({
				name: podName,
				namespace: this.config.namespace,
			});

			return logs ?? "No logs available";
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			return `Failed to get logs: ${errorMessage}`;
		}
	}

	/**
	 * Gets events for a Job (useful for debugging scheduling issues)
	 */
	async getJobEvents(jobName: string): Promise<Record<string, unknown>[]> {
		try {
			const eventList = await this.coreApi.listNamespacedEvent({
				namespace: this.config.namespace,
				fieldSelector: `involvedObject.name=${jobName}`,
			});

			return toPlainObjectArray(eventList.items);
		} catch (error) {
			console.error(
				`[KubernetesPlatform] Failed to get events for job ${jobName}:`,
				error,
			);

			return [];
		}
	}

	/**
	 * Lists all K8s jobs with their status for table display
	 * Extracts botId from job labels and determines status from job conditions
	 */
	async listJobs(options?: { status?: K8sBotStatus[]; sort?: string }): Promise<
		{
			id: number;
			jobName: string;
			status: K8sBotStatus;
			botId: number;
			namespace: string;
			createdAt: Date;
		}[]
	> {
		try {
			const jobList = await this.batchApi.listNamespacedJob({
				namespace: this.config.namespace,
			});

			const jobs = jobList.items
				.map((job, index) => {
					const status = K8sStatusMapper.toDomain(job.status);
					const botIdLabel = job.metadata?.labels?.botId;
					const botId = botIdLabel ? Number.parseInt(botIdLabel, 10) : 0;
					const jobName = job.metadata?.name ?? `unknown-${index}`;

					const createdAt = job.metadata?.creationTimestamp
						? new Date(job.metadata.creationTimestamp)
						: new Date();

					return {
						id: index + 1,
						jobName,
						status,
						botId,
						namespace: this.config.namespace,
						createdAt,
					};
				})
				.filter((job) => {
					if (options?.status && options.status.length > 0) {
						return options.status.includes(job.status);
					}

					return true;
				});

			// Sort jobs (default: age.desc = newest first)
			const sortField = options?.sort ?? "age.desc";

			if (sortField === "age.desc") {
				jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
			} else if (sortField === "age.asc") {
				jobs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
			}

			return jobs;
		} catch (error) {
			console.error("[KubernetesPlatform] Failed to list jobs:", error);

			return [];
		}
	}

	/**
	 * Gets cluster resource metrics (for capacity monitoring)
	 * Field order: platform discriminator, metadata, then status fields (UPPERCASE per PLATFORM_NOMENCLATURE.md)
	 */
	async getClusterMetrics(): Promise<{
		namespace: string;
		PENDING: number;
		ACTIVE: number;
		SUCCEEDED: number;
		FAILED: number;
		total: number;
	}> {
		try {
			const jobList = await this.batchApi.listNamespacedJob({
				namespace: this.config.namespace,
			});

			let ACTIVE = 0;
			let PENDING = 0;
			let SUCCEEDED = 0;
			let FAILED = 0;

			for (const job of jobList.items) {
				if (job.status?.active && job.status.active > 0) {
					ACTIVE++;
				} else if (job.status?.succeeded && job.status.succeeded > 0) {
					SUCCEEDED++;
				} else if (job.status?.failed && job.status.failed > 0) {
					FAILED++;
				} else {
					PENDING++;
				}
			}

			const podList = await this.coreApi.listNamespacedPod({
				namespace: this.config.namespace,
			});

			return {
				namespace: this.config.namespace,
				PENDING,
				ACTIVE,
				SUCCEEDED,
				FAILED,
				total: podList.items.length,
			};
		} catch (error) {
			console.error(
				"[KubernetesPlatform] Failed to get cluster metrics:",
				error,
			);

			return {
				namespace: this.config.namespace,
				PENDING: 0,
				ACTIVE: 0,
				SUCCEEDED: 0,
				FAILED: 0,
				total: 0,
			};
		}
	}

	/**
	 * Builds a unique job name for a bot
	 */
	private buildJobName(botId: number): string {
		return `bot-${botId}-${Date.now()}`;
	}

	/**
	 * Builds the Kubernetes Job specification
	 */
	private buildJobSpec(botConfig: BotConfig, jobName: string): V1Job {
		const image = this.getImageForPlatform(botConfig.meeting.platform);

		return {
			apiVersion: "batch/v1",
			kind: "Job",
			metadata: {
				name: jobName,
				namespace: this.config.namespace,
				labels: {
					app: "meeboter-bot",
					platform: botConfig.meeting.platform ?? "unknown",
					botId: botConfig.id.toString(),
				},
			},
			spec: {
				// Don't retry failed jobs
				backoffLimit: 0,
				// Auto-delete completed jobs after 5 minutes
				ttlSecondsAfterFinished: 300,
				template: {
					metadata: {
						labels: {
							app: "meeboter-bot",
							platform: botConfig.meeting.platform ?? "unknown",
							botId: botConfig.id.toString(),
						},
					},
					spec: {
						restartPolicy: "Never",
						// GHCR credentials for pulling private images
						imagePullSecrets: [{ name: "ghcr-credentials" }],
						containers: [
							{
								name: "bot",
								image,
								env: this.buildEnvironmentVariables(botConfig),
								resources: {
									requests: {
										cpu: this.config.cpuRequest,
										memory: this.config.memoryRequest,
									},
									limits: {
										cpu: this.config.cpuLimit,
										memory: this.config.memoryLimit,
									},
								},
							},
						],
					},
				},
			},
		};
	}

	/**
	 * Gets the container image for a meeting platform
	 */
	private getImageForPlatform(platform: string | undefined): string {
		const { imageRegistry, imageTag } = this.config;

		switch (platform?.toLowerCase()) {
			case "zoom":
				return `${imageRegistry}/meeboter-zoom-bot:${imageTag}`;
			case "microsoft-teams":
				return `${imageRegistry}/meeboter-microsoft-teams-bot:${imageTag}`;
			case "google-meet":
				return `${imageRegistry}/meeboter-google-meet-bot:${imageTag}`;
			default:
				throw new Error(`Unsupported meeting platform: ${platform}`);
		}
	}

	/**
	 * Builds environment variables for the bot container
	 */
	private buildEnvironmentVariables(botConfig: BotConfig): V1EnvVar[] {
		return [
			// Bot identifier for fetching config from Milo API (K8s uses direct bot ID)
			{ name: "BOT_ID", value: botConfig.id.toString() },

			// Milo API URL for tRPC calls
			{ name: "MILO_URL", value: this.botEnvConfig.miloUrl },

			// Authentication
			{ name: "MILO_AUTH_TOKEN", value: this.botEnvConfig.miloAuthToken },

			// S3-compatible storage configuration
			{ name: "S3_ENDPOINT", value: this.botEnvConfig.s3Endpoint },
			{ name: "S3_ACCESS_KEY", value: this.botEnvConfig.s3AccessKey },
			{ name: "S3_SECRET_KEY", value: this.botEnvConfig.s3SecretKey },
			{ name: "S3_BUCKET_NAME", value: this.botEnvConfig.s3BucketName },
			{ name: "S3_REGION", value: this.botEnvConfig.s3Region },

			// Runtime
			{ name: "NODE_ENV", value: "production" },
		];
	}

	/**
	 * Checks if an error is a Kubernetes 404 Not Found error.
	 * The @kubernetes/client-node library uses 'code' property for HTTP status.
	 */
	private isNotFoundError(error: unknown): boolean {
		if (error && typeof error === "object") {
			// @kubernetes/client-node uses 'code' property for HTTP status
			if ("code" in error && (error as { code: number }).code === 404) {
				return true;
			}

			// Also check 'statusCode' for backwards compatibility
			if (
				"statusCode" in error &&
				(error as { statusCode: number }).statusCode === 404
			) {
				return true;
			}

			// Check nested response object
			if ("response" in error) {
				const response = (
					error as { response: { statusCode?: number; code?: number } }
				).response;

				return response?.statusCode === 404 || response?.code === 404;
			}
		}

		return false;
	}
}

/**
 * Creates a Kubernetes platform service instance from environment variables
 */
export function createKubernetesPlatformService(): KubernetesPlatformService {
	const config: KubernetesPlatformConfig = {
		namespace: env.K8S_NAMESPACE,
		imageRegistry: env.K8S_IMAGE_REGISTRY ?? env.GHCR_ORG,
		imageTag: env.K8S_IMAGE_TAG,
		kubeconfigPath: env.K8S_KUBECONFIG,
		cpuRequest: env.K8S_BOT_CPU_REQUEST,
		cpuLimit: env.K8S_BOT_CPU_LIMIT,
		memoryRequest: env.K8S_BOT_MEMORY_REQUEST,
		memoryLimit: env.K8S_BOT_MEMORY_LIMIT,
	};

	const botEnvConfig: KubernetesBotEnvConfig = {
		miloUrl: env.NEXT_PUBLIC_APP_ORIGIN_URL,
		miloAuthToken: env.MILO_AUTH_TOKEN ?? "",
		s3Endpoint: env.S3_ENDPOINT,
		s3AccessKey: env.S3_ACCESS_KEY,
		s3SecretKey: env.S3_SECRET_KEY,
		s3BucketName: env.S3_BUCKET_NAME,
		s3Region: env.S3_REGION,
	};

	return new KubernetesPlatformService(config, botEnvConfig);
}
