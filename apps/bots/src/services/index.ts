import type { Bot } from "../bot";
import { env } from "../config/env";
import { BotEventEmitter } from "../events";
import { BotLogger, parseLogLevel } from "../logger";
import { createTrpcClient, type TrpcClient } from "../trpc";
import { UploadRecordingUseCase } from "../use-cases";
import { DurationMonitorWorker } from "../workers/duration-monitor-worker";
import { HeartbeatWorker } from "../workers/heartbeat-worker";
import { MessageQueueWorker } from "../workers/message-queue-worker";
import { S3StorageProvider } from "./storage/s3-provider";

/**
 * Container for all services in the application
 */
interface Services {
	emitter: BotEventEmitter;
	logger: BotLogger;
	trpc: TrpcClient;
	uploadRecording: UploadRecordingUseCase | null;
	workers: {
		heartbeat: HeartbeatWorker;
		durationMonitor: DurationMonitorWorker;
		messageQueue: MessageQueueWorker;
	};
}

/**
 * Options for creating services
 */
interface CreateServicesOptions {
	botId: number;
	initialLogLevel?: string;

	/** Getter function for the bot instance (set after bot is created) */
	getBot: () => Bot | null;
}

/**
 * Creates all services with proper dependency injection
 */
export function createServices(options: CreateServicesOptions): Services {
	const logLevel = options.initialLogLevel
		? parseLogLevel(options.initialLogLevel)
		: undefined;

	const trpc = createTrpcClient({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

	// Create event emitter first (shared between logger and bot)
	const emitter = new BotEventEmitter({
		botId: options.botId,
		trpc,
	});

	// Create logger with event emitter
	const logger = new BotLogger(options.botId, emitter, { logLevel });

	logger.enableStreaming({ trpc });

	// Create storage use cases only if S3 is fully configured
	let uploadRecording: UploadRecordingUseCase | null = null;

	const s3Endpoint = env.S3_ENDPOINT;
	const s3AccessKey = env.S3_ACCESS_KEY;
	const s3SecretKey = env.S3_SECRET_KEY;
	const s3BucketName = env.S3_BUCKET_NAME;

	if (s3Endpoint && s3AccessKey && s3SecretKey && s3BucketName) {
		const storageService = new S3StorageProvider({
			endpoint: s3Endpoint,
			region: env.S3_REGION,
			accessKeyId: s3AccessKey,
			secretAccessKey: s3SecretKey,
			bucketName: s3BucketName,
		});

		uploadRecording = new UploadRecordingUseCase(storageService);
	}

	const workers = {
		heartbeat: new HeartbeatWorker(trpc, logger),
		durationMonitor: new DurationMonitorWorker(logger),
		messageQueue: new MessageQueueWorker(trpc, options.getBot, logger),
	};

	return { emitter, logger, trpc, uploadRecording, workers };
}
