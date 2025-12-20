import type { Bot } from "../bot";
import { env } from "../config/env";
import { BotLogger, parseLogLevel } from "../logger";
import { createTrpcClient, type TrpcClient } from "../trpc";
import { DurationMonitorWorker } from "../workers/duration-monitor-worker";
import { HeartbeatWorker } from "../workers/heartbeat-worker";
import { MessageQueueWorker } from "../workers/message-queue-worker";
import { S3Service } from "./s3-service";

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
	createS3ServiceFromEnv,
	S3Service,
	type S3ServiceConfig,
} from "./s3-service";

/**
 * Container for all services in the application
 */
export interface Services {
	logger: BotLogger;
	trpc: TrpcClient;
	s3: S3Service;
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

	const s3 = new S3Service({
		endpoint: env.S3_ENDPOINT,
		region: env.S3_REGION,
		accessKeyId: env.S3_ACCESS_KEY,
		secretAccessKey: env.S3_SECRET_KEY,
		bucketName: env.S3_BUCKET_NAME,
	});

	const workers = {
		heartbeat: new HeartbeatWorker(trpc, logger),
		durationMonitor: new DurationMonitorWorker(logger),
		messageQueue: new MessageQueueWorker(trpc, options.getBot, logger),
	};

	return { logger, trpc, s3, workers };
}
