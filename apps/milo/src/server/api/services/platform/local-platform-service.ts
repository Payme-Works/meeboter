import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { BotConfig } from "@/server/database/schema";

import { LocalStatusMapper } from "./mappers/local-status-mapper";
import type {
	PlatformDeployWithQueueResult,
	PlatformService,
} from "./platform-service";

/**
 * Local development status values (UPPERCASE convention)
 */
export type LocalBotStatus = "IDLE" | "RUNNING" | "STOPPED" | "ERROR";

interface LocalBotProcess {
	process: ChildProcess;
	botId: number;
	startedAt: Date;
}

interface LocalBotEnvConfig {
	miloUrl: string;
	miloAuthToken: string;
	s3Endpoint: string;
	s3AccessKey: string;
	s3SecretKey: string;
	s3BucketName: string;
	s3Region: string;
}

// Get the directory of this file to calculate paths reliably
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local platform service for development
 *
 * Runs bot processes locally using child_process.spawn
 * instead of deploying to Coolify or AWS.
 */
export class LocalPlatformService implements PlatformService<LocalBotStatus> {
	readonly platformName = "local" as const;

	private readonly runningBots = new Map<string, LocalBotProcess>();
	private readonly botsDir: string;

	constructor(private readonly envConfig: LocalBotEnvConfig) {
		// Resolve path to bots directory relative to this file
		// This file is at: apps/milo/src/server/api/services/platform/local-platform-service.ts
		// Bots dir is at: apps/bots
		// So we go up 7 levels to reach apps/, then into bots/
		this.botsDir = path.resolve(
			__dirname,
			"..",
			"..",
			"..",
			"..",
			"..",
			"..",
			"bots",
		);

		console.log(`[LocalPlatform] Bot directory: ${this.botsDir}`);
	}

	async deployBot(
		botConfig: BotConfig,
	): Promise<PlatformDeployWithQueueResult> {
		const identifier = `local-bot-${botConfig.id}-${Date.now()}`;
		const platform = botConfig.meeting.platform ?? "unknown";

		console.log(
			`[LocalPlatform] Deploying bot ${botConfig.id} for ${platform} platform`,
		);

		try {
			// Build environment variables for the bot process
			// Filter out undefined values from process.env
			const baseEnv: Record<string, string> = {};
			for (const [key, value] of Object.entries(process.env)) {
				if (value !== undefined) {
					baseEnv[key] = value;
				}
			}

			const botEnv: Record<string, string> = {
				...baseEnv,
				POOL_SLOT_UUID: identifier,
				MILO_URL: this.envConfig.miloUrl,
				MILO_AUTH_TOKEN: this.envConfig.miloAuthToken,
				S3_ENDPOINT: this.envConfig.s3Endpoint,
				S3_ACCESS_KEY: this.envConfig.s3AccessKey,
				S3_SECRET_KEY: this.envConfig.s3SecretKey,
				S3_BUCKET_NAME: this.envConfig.s3BucketName,
				S3_REGION: this.envConfig.s3Region,
				BOT_PLATFORM: platform,
				NODE_ENV: "development",
			};

			// Spawn the bot process directly (bypass package.json scripts to avoid pnpm interference)
			const botProcess: ChildProcess = spawn("bun", ["src/index.ts"], {
				cwd: this.botsDir,
				env: botEnv as NodeJS.ProcessEnv,
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			});

			// Store the running process
			this.runningBots.set(identifier, {
				process: botProcess,
				botId: botConfig.id,
				startedAt: new Date(),
			});

			// Log stdout
			botProcess.stdout?.on("data", (data: Buffer) => {
				const lines = data.toString().trim().split("\n");
				for (const line of lines) {
					console.log(`[Bot ${botConfig.id}] ${line}`);
				}
			});

			// Log stderr
			botProcess.stderr?.on("data", (data: Buffer) => {
				const lines = data.toString().trim().split("\n");
				for (const line of lines) {
					console.error(`[Bot ${botConfig.id}] ${line}`);
				}
			});

			// Handle process exit
			botProcess.on("exit", (code: number | null, signal: string | null) => {
				console.log(
					`[LocalPlatform] Bot ${botConfig.id} exited with code ${code}, signal ${signal}`,
				);

				this.runningBots.delete(identifier);
			});

			botProcess.on("error", (error: Error) => {
				console.error(
					`[LocalPlatform] Bot ${botConfig.id} process error:`,
					error,
				);

				this.runningBots.delete(identifier);
			});

			console.log(
				`[LocalPlatform] Bot ${botConfig.id} started with PID ${botProcess.pid}`,
			);

			return {
				success: true,
				identifier,
				slotName: `local-${botConfig.id}`,
			};
		} catch (error) {
			console.error(
				`[LocalPlatform] Failed to deploy bot ${botConfig.id}:`,
				error,
			);

			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	async stopBot(identifier: string): Promise<void> {
		const botProcess = this.runningBots.get(identifier);

		if (!botProcess) {
			console.warn(`[LocalPlatform] Bot ${identifier} not found`);

			return;
		}

		console.log(`[LocalPlatform] Stopping bot ${identifier}`);

		try {
			// Send SIGTERM for graceful shutdown
			botProcess.process.kill("SIGTERM");

			// Wait a bit, then force kill if still running
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => {
					if (!botProcess.process.killed) {
						console.warn(`[LocalPlatform] Force killing bot ${identifier}`);

						botProcess.process.kill("SIGKILL");
					}

					resolve();
				}, 5000);

				botProcess.process.on("exit", () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			this.runningBots.delete(identifier);
		} catch (error) {
			console.error(`[LocalPlatform] Error stopping bot ${identifier}:`, error);
		}
	}

	async getBotStatus(identifier: string): Promise<LocalBotStatus> {
		const botProcess = this.runningBots.get(identifier);
		const status = LocalStatusMapper.toDomain(botProcess?.process);

		// Clean up stopped processes from the map
		if (status === "STOPPED" && botProcess) {
			this.runningBots.delete(identifier);
		}

		return status;
	}

	async releaseBot(botId: number): Promise<void> {
		// Find the bot by botId
		const entries = Array.from(this.runningBots.entries());
		for (const [identifier, botProcess] of entries) {
			if (botProcess.botId === botId) {
				await this.stopBot(identifier);

				return;
			}
		}

		console.warn(`[LocalPlatform] No running bot found for botId ${botId}`);
	}

	async processQueue(): Promise<void> {
		// Local platform doesn't have a queue
	}

	/**
	 * Get count of currently running bots (for debugging)
	 */
	getRunningBotCount(): number {
		return this.runningBots.size;
	}

	/**
	 * Get list of running bot identifiers (for debugging)
	 */
	getRunningBots(): string[] {
		return Array.from(this.runningBots.keys());
	}
}
