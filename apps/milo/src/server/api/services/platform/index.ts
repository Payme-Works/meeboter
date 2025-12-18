export type {
	AWSBotEnvConfig,
	AWSPlatformConfig,
} from "./aws-platform-service";

export { AWSPlatformService } from "./aws-platform-service";
export { CoolifyPlatformService } from "./coolify-platform-service";
export type { PlatformType } from "./platform-factory";

export { createPlatformService, getPlatformType } from "./platform-factory";
export type {
	PlatformBotStatus,
	PlatformDeployResult,
	PlatformDeployWithQueueResult,
	PlatformService,
} from "./platform-service";
