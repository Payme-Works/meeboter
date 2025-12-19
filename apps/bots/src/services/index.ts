import { env } from "../config/env";
import { BotLogger, parseLogLevel } from "../logger";
import { DurationMonitorWorker } from "../workers/duration-monitor-worker";
import { HeartbeatWorker } from "../workers/heartbeat-worker";
import { MessageQueueWorker } from "../workers/message-queue-worker";
import { BotService } from "./bot-service";
import { S3Service } from "./s3-service";
import { TrpcService } from "./trpc-service";

export {
	BotLogger,
	LogLevel,
	parseLogLevel,
	type ScreenshotData,
} from "../logger";
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
export {
	type AutomaticLeave,
	type BotConfig,
	EventCode,
	type MeetingInfo,
	type SpeakerTimeframe,
	STATUS_EVENT_CODES,
	Status,
	TrpcService,
	type TrpcServiceOptions,
} from "./trpc-service";

/**
 * Container for all services in the application
 */
export interface Services {
	logger: BotLogger;
	trpc: TrpcService;
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

	const trpc = new TrpcService({
		url: env.MILO_URL,
		authToken: env.MILO_AUTH_TOKEN,
	});

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
