import { env } from "../config/env";
import { BotLogger, parseLogLevel } from "../logger";
import { createTrpcClient, type TrpcClient } from "../trpc";
import { DurationMonitorWorker } from "../workers/duration-monitor-worker";
import { HeartbeatWorker } from "../workers/heartbeat-worker";
import { MessageQueueWorker } from "../workers/message-queue-worker";
import { BotService } from "./bot-service";
import { S3Service } from "./s3-service";

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
// Re-export services and types for convenience
export {
	type BotInterface,
	BotService,
	type CreateBotOptions,
} from "./bot-service";
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
	bot: BotService;
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

	const bot = new BotService(logger, trpc, s3);

	const workers = {
		heartbeat: new HeartbeatWorker(trpc, logger),
		durationMonitor: new DurationMonitorWorker(logger),
		messageQueue: new MessageQueueWorker(trpc, bot, logger),
	};

	return { logger, trpc, s3, bot, workers };
}
