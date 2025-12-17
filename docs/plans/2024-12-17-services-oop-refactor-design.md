# Services OOP Refactor Design

## Goals

- **Dependency injection** - Inject db, services, configs once instead of passing everywhere
- **Encapsulation** - Group related state and behavior in classes
- **Code organization** - Clear service boundaries by domain

## Architecture

### Service Classes

```
services/
  index.ts                      # Factory + singleton export
  coolify-service.ts            # CoolifyService class
  bot-pool-service.ts           # BotPoolService class
  bot-deployment-service.ts     # BotDeploymentService class
```

### Dependency Graph

```
CoolifyService (no dependencies)
       ↓
BotPoolService (depends on: db, CoolifyService)
       ↓
BotDeploymentService (depends on: db, BotPoolService)
```

## Service Definitions

### CoolifyService

```typescript
// coolify-service.ts
export interface CoolifyConfig {
  apiUrl: string;
  apiToken: string;
  projectUuid: string;
  serverUuid: string;
  environmentName: string;
  destinationUuid: string;
}

export class CoolifyDeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoolifyDeploymentError";
  }
}

export class CoolifyService {
  constructor(private config: CoolifyConfig) {}

  async createApplication(name: string, image: BotImage, botConfig: BotConfig): Promise<string>
  async startApplication(uuid: string): Promise<void>
  async stopApplication(uuid: string): Promise<void>
  async deleteApplication(uuid: string): Promise<void>
  async applicationExists(uuid: string): Promise<boolean>
  async getApplicationStatus(uuid: string): Promise<string>
  async updateEnvironmentVariables(uuid: string, vars: EnvVar[]): Promise<void>
  async updateDescription(uuid: string, description: string): Promise<void>
  async waitForDeployment(uuid: string, timeoutMs?: number): Promise<DeploymentStatusResult>
}
```

### BotPoolService

```typescript
// bot-pool-service.ts
export interface PoolSlot {
  id: number;
  coolifyServiceUuid: string;
  slotName: string;
  status: "idle" | "busy" | "error";
  assignedBotId: number | null;
}

export interface PoolStats {
  total: number;
  idle: number;
  busy: number;
  error: number;
  maxSize: number;
}

export class BotPoolService {
  constructor(
    private db: Database,
    private coolify: CoolifyService,
  ) {}

  // Pool management
  async acquireOrCreateSlot(botId: number): Promise<PoolSlot | null>
  async releaseSlot(botId: number): Promise<void>
  async configureAndStartSlot(slot: PoolSlot, config: BotConfig): Promise<PoolSlot>
  async markSlotError(slotId: number, errorMessage: string): Promise<void>
  async getPoolStats(): Promise<PoolStats>

  // Queue management
  async addToQueue(botId: number, timeoutMs: number, priority?: number): Promise<number>
  async processQueueOnSlotRelease(): Promise<void>
  async getQueueStats(): Promise<QueueStats>

  // Recovery (internal)
  private async recreateSlotApplication(slot: PoolSlot, config: BotConfig): Promise<PoolSlot>
}
```

### BotDeploymentService

```typescript
// bot-deployment-service.ts
export interface DeployBotResult {
  bot: Bot;
  queued: boolean;
  queuePosition?: number;
  estimatedWaitMs?: number;
}

export class BotDeploymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BotDeploymentError";
  }
}

export class BotDeploymentService {
  constructor(
    private db: Database,
    private pool: BotPoolService,
  ) {}

  async deploy(botId: number, queueTimeoutMs?: number): Promise<DeployBotResult>
  async release(botId: number): Promise<void>
  async shouldDeployImmediately(startTime: Date | null): Promise<boolean>
}
```

## Factory & Initialization

```typescript
// services/index.ts
import { db } from "@/server/database/db";
import { env } from "@/env";
import { CoolifyService } from "./coolify-service";
import { BotPoolService } from "./bot-pool-service";
import { BotDeploymentService } from "./bot-deployment-service";

export interface Services {
  coolify: CoolifyService;
  pool: BotPoolService;
  deployment: BotDeploymentService;
}

function createServices(): Services {
  const coolify = new CoolifyService({
    apiUrl: env.COOLIFY_API_URL,
    apiToken: env.COOLIFY_API_TOKEN,
    projectUuid: env.COOLIFY_PROJECT_UUID,
    serverUuid: env.COOLIFY_SERVER_UUID,
    environmentName: env.COOLIFY_ENVIRONMENT_NAME,
    destinationUuid: env.COOLIFY_DESTINATION_UUID,
  });

  const pool = new BotPoolService(db, coolify);
  const deployment = new BotDeploymentService(db, pool);

  return { coolify, pool, deployment };
}

export const services = createServices();
```

## Usage in Routers

```typescript
// routers/bots.ts
import { services } from "../services";

export const botsRouter = createTRPCRouter({
  createBot: protectedProcedure
    .input(createBotSchema)
    .mutation(async ({ input }) => {
      // ... create bot in db ...
      const result = await services.deployment.deploy(bot.id);
      return result;
    }),
});
```

## Migration Plan

1. Create `coolify-service.ts` - No dependencies
2. Create `bot-pool-service.ts` - Depends on CoolifyService
3. Create `bot-deployment-service.ts` - Depends on BotPoolService
4. Create `index.ts` - Factory
5. Update routers to use `services.*`
6. Delete old files:
   - `coolify-deployment.ts`
   - `bot-pool-manager.ts`
   - `bot-pool-queue.ts`
   - `bot-deployment.ts`
   - `slot-recovery.ts`
7. Update tests

## Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| DI approach | Manual constructor injection | Simple, no magic, full control |
| Initialization | Global singleton factory | Services created once at startup |
| Types | Colocated with each service | Types live where they're used |
| Filenames | kebab-case | Project convention |
