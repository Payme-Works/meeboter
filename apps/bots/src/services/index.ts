import type { Bot } from "../bot";
import { env } from "../config/env";
import { BotLogger, parseLogLevel } from "../logger";
import { createTrpcClient, type TrpcClient } from "../trpc";
import { DurationMonitorWorker } from "../workers/duration-monitor-worker";
import { HeartbeatWorker } from "../workers/heartbeat-worker";
import { MessageQueueWorker } from "../workers/message-queue-worker";
import { S3StorageProvider, StorageService } from "./storage";

// Re-export bot and factory
export { Bot } from "../bot";
export { type CreateBotOptions, createBot } from "../bot-factory";
export {
	BotLogger,
	LogLevel,
	parseLogLevel,
	type ScreenshotData,
} from "../logger";
export {
	type AutomaticLeave,
	type BotConfig,
	createTrpcClient,
	EventCode,
	type MeetingInfo,
	type SpeakerTimeframe,
	STATUS_EVENT_CODES,
	Status,
	type TrpcClient,
	type TrpcClientOptions,
} from "../trpc";
export {
	createS3ProviderFromEnv,
	S3StorageProvider,
	type StorageConfig,
	type StorageProvider,
	StorageService,
} from "./storage";

/**
 * Container for all services in the application
 */
export interface Services {
	logger: BotLogger;
	trpc: TrpcClient;
	storage: StorageService;
	workers: {
		heartbeat: HeartbeatWorker;
		durationMonitor: DurationMonitorWorker;
		messageQueue: MessageQueueWorker;
	};
}

/**
 * Options for creating services
 */
export interface CreateServicesOptions {
	botId: number;
	initialLogLevel?: string;
	/** Getter function for the bot instance (set after bot is created) */
	getBot: () => Bot | null;
}

/**
 * Creates all services with proper dependency injection
 */
export function createServices(options: CreateServicesOptions): Services {
	// Create in dependency order
	const logLevel = options.initialLogLevel
		? parseLogLevel(options.initialLogLevel)
		: undefined;

	const logger = new BotLogger(options.botId, { logLevel });

	const trpc = createTrpcClient({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

	// Enable log streaming to backend
	logger.enableStreaming({ trpcClient: trpc });

	// Create storage service with S3 provider
	const s3Provider = new S3StorageProvider({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
		bucketName: env.S3_BUCKET_NAME,
	});

	const storage = new StorageService(s3Provider);

	const workers = {
		heartbeat: new HeartbeatWorker(trpc, logger),
		durationMonitor: new DurationMonitorWorker(logger),
		messageQueue: new MessageQueueWorker(trpc, options.getBot, logger),
	};

	return { logger, trpc, storage, workers };
}
