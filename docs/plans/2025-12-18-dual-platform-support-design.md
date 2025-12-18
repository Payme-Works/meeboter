# Dual Platform Support Design

> Enable Meeboter to run on both Coolify (bare-metal) and AWS ECS deployments

**Date**: 2025-12-18
**Status**: Approved

## Overview

This design introduces a platform abstraction layer that allows Meeboter to deploy bots using either Coolify (pool-based) or AWS ECS (task-based) backends. Platform selection happens at startup via environment configuration with auto-detection support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Application Layer                       │
│  (tRPC routers, bot lifecycle management, recording logic)  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     PlatformService                          │
│              (Interface - deployment abstraction)            │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│  CoolifyPlatformService │     │   AWSPlatformService    │
│  - Pool-based system    │     │   - ECS task-based      │
│  - Pre-provisioned      │     │   - On-demand           │
│  - Env var injection    │     │   - Task definitions    │
└─────────────────────────┘     └─────────────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│     Coolify API         │     │      AWS ECS API        │
│  (existing service)     │     │    (RunTask, etc.)      │
└─────────────────────────┘     └─────────────────────────┘
```

### Key Decisions

1. **Platform selection at startup** via `DEPLOYMENT_PLATFORM` env var (`coolify` | `aws` | `auto`)
2. **Auto-detection** checks for Coolify API URL first, falls back to AWS credentials
3. **Existing code preserved** - CoolifyService and BotPoolService remain unchanged, wrapped by CoolifyPlatformService
4. **Single factory** creates the appropriate implementation based on platform

## PlatformService Interface

```typescript
// apps/milo/src/server/api/services/platform/platform-service.ts

interface DeployResult {
  /** Platform-specific identifier (Coolify UUID or ECS task ARN) */
  identifier: string;
  /** Bot connection URL for health checks */
  connectionUrl: string;
}

interface BotDeploymentConfig {
  botId: number;
  platform: 'zoom' | 'teams' | 'meet';
  meetingUrl: string;
  meetingPassword?: string;
  botDisplayName: string;
  recordingEnabled: boolean;
  automaticLeave: {
    waitingRoomTimeout: number;
    noOneJoinedTimeout: number;
    everyoneLeftTimeout: number;
  };
}

interface PlatformService {
  /** Deploy a bot and return its identifier */
  deployBot(config: BotDeploymentConfig): Promise<DeployResult>;

  /** Stop a running bot */
  stopBot(identifier: string): Promise<void>;

  /** Get current bot status */
  getBotStatus(identifier: string): Promise<'running' | 'stopped' | 'unknown'>;

  /** Clean up resources after bot completion */
  cleanup(identifier: string): Promise<void>;

  /** Platform name for logging */
  readonly platformName: string;
}
```

### Design Notes

- `identifier` is platform-agnostic (Coolify UUID vs ECS task ARN)
- `BotDeploymentConfig` contains everything needed to configure a bot
- `cleanup` handles platform-specific teardown (returning slot to pool vs ECS task cleanup)
- Status values are normalized across platforms

## CoolifyPlatformService Implementation

```typescript
// apps/milo/src/server/api/services/platform/coolify-platform-service.ts

class CoolifyPlatformService implements PlatformService {
  readonly platformName = 'coolify';

  constructor(
    private poolService: BotPoolService,
    private coolifyService: CoolifyService
  ) {}

  async deployBot(config: BotDeploymentConfig): Promise<DeployResult> {
    // 1. Acquire slot from pool
    const slot = await this.poolService.acquireSlot(config.platform);

    // 2. Configure environment variables
    await this.coolifyService.updateEnvironmentVariables(
      slot.coolifyServiceUuid,
      this.buildEnvVars(config)
    );

    // 3. Start the application
    await this.coolifyService.startApplication(slot.coolifyServiceUuid);

    return {
      identifier: slot.coolifyServiceUuid,
      connectionUrl: slot.connectionUrl,
    };
  }

  async stopBot(identifier: string): Promise<void> {
    await this.coolifyService.stopApplication(identifier);
  }

  async getBotStatus(identifier: string): Promise<'running' | 'stopped' | 'unknown'> {
    const status = await this.coolifyService.getApplicationStatus(identifier);
    return this.normalizeStatus(status);
  }

  async cleanup(identifier: string): Promise<void> {
    // Return slot to pool for reuse
    await this.poolService.releaseSlot(identifier);
  }

  private buildEnvVars(config: BotDeploymentConfig): Record<string, string> {
    return {
      BOT_ID: String(config.botId),
      MEETING_URL: config.meetingUrl,
      MEETING_PASSWORD: config.meetingPassword || '',
      BOT_DISPLAY_NAME: config.botDisplayName,
      RECORDING_ENABLED: String(config.recordingEnabled),
      WAITING_ROOM_TIMEOUT: String(config.automaticLeave.waitingRoomTimeout),
      NO_ONE_JOINED_TIMEOUT: String(config.automaticLeave.noOneJoinedTimeout),
      EVERYONE_LEFT_TIMEOUT: String(config.automaticLeave.everyoneLeftTimeout),
    };
  }

  private normalizeStatus(coolifyStatus: string): 'running' | 'stopped' | 'unknown' {
    if (coolifyStatus === 'running') return 'running';
    if (coolifyStatus === 'stopped' || coolifyStatus === 'exited') return 'stopped';
    return 'unknown';
  }
}
```

### Key Points

- Reuses existing `BotPoolService` and `CoolifyService` without modification
- Pool semantics preserved (acquire/release slots)
- Environment variable injection for bot configuration
- Slots are recycled, not destroyed

## AWSPlatformService Implementation

```typescript
// apps/milo/src/server/api/services/platform/aws-platform-service.ts

import { ECSClient, RunTaskCommand, StopTaskCommand, DescribeTasksCommand } from '@aws-sdk/client-ecs';

class AWSPlatformService implements PlatformService {
  readonly platformName = 'aws';

  constructor(
    private ecsClient: ECSClient,
    private config: {
      cluster: string;
      subnets: string[];
      securityGroups: string[];
      taskDefinitions: Record<'zoom' | 'teams' | 'meet', string>;
    }
  ) {}

  async deployBot(config: BotDeploymentConfig): Promise<DeployResult> {
    const taskDef = this.config.taskDefinitions[config.platform];

    const result = await this.ecsClient.send(new RunTaskCommand({
      cluster: this.config.cluster,
      taskDefinition: taskDef,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: this.config.subnets,
          securityGroups: this.config.securityGroups,
          assignPublicIp: 'ENABLED',
        },
      },
      overrides: {
        containerOverrides: [{
          name: `${config.platform}-bot`,
          environment: this.buildEnvVars(config),
        }],
      },
    }));

    const taskArn = result.tasks?.[0]?.taskArn;
    if (!taskArn) {
      throw new Error('Failed to start ECS task');
    }

    return {
      identifier: taskArn,
      connectionUrl: await this.resolveTaskUrl(taskArn),
    };
  }

  async stopBot(identifier: string): Promise<void> {
    await this.ecsClient.send(new StopTaskCommand({
      cluster: this.config.cluster,
      task: identifier,
    }));
  }

  async getBotStatus(identifier: string): Promise<'running' | 'stopped' | 'unknown'> {
    const result = await this.ecsClient.send(new DescribeTasksCommand({
      cluster: this.config.cluster,
      tasks: [identifier],
    }));

    const status = result.tasks?.[0]?.lastStatus;
    return this.normalizeStatus(status);
  }

  async cleanup(identifier: string): Promise<void> {
    // ECS tasks are ephemeral, no pool to manage
    // Just ensure task is stopped
    await this.stopBot(identifier).catch(() => {});
  }

  private buildEnvVars(config: BotDeploymentConfig): Array<{ name: string; value: string }> {
    return [
      { name: 'BOT_ID', value: String(config.botId) },
      { name: 'MEETING_URL', value: config.meetingUrl },
      { name: 'MEETING_PASSWORD', value: config.meetingPassword || '' },
      { name: 'BOT_DISPLAY_NAME', value: config.botDisplayName },
      { name: 'RECORDING_ENABLED', value: String(config.recordingEnabled) },
      { name: 'WAITING_ROOM_TIMEOUT', value: String(config.automaticLeave.waitingRoomTimeout) },
      { name: 'NO_ONE_JOINED_TIMEOUT', value: String(config.automaticLeave.noOneJoinedTimeout) },
      { name: 'EVERYONE_LEFT_TIMEOUT', value: String(config.automaticLeave.everyoneLeftTimeout) },
    ];
  }

  private normalizeStatus(ecsStatus?: string): 'running' | 'stopped' | 'unknown' {
    if (ecsStatus === 'RUNNING') return 'running';
    if (ecsStatus === 'STOPPED' || ecsStatus === 'DEPROVISIONING') return 'stopped';
    return 'unknown';
  }

  private async resolveTaskUrl(taskArn: string): Promise<string> {
    // Wait for task to have network interface assigned
    // Then resolve public IP from ENI
    // Implementation depends on service discovery setup
    // ...
  }
}
```

### Key Differences from Coolify

- No pool concept, tasks are ephemeral
- Task definitions pre-configured in AWS
- Network config passed at runtime
- URL resolution requires ENI lookup or service discovery

## Platform Factory

```typescript
// apps/milo/src/server/api/services/platform/platform-factory.ts

import { ECSClient } from '@aws-sdk/client-ecs';
import { PlatformService } from './platform-service';
import { CoolifyPlatformService } from './coolify-platform-service';
import { AWSPlatformService } from './aws-platform-service';
import { CoolifyService } from '../coolify-service';
import { BotPoolService } from '../bot-pool-service';
import { db } from '@/server/db';

type PlatformType = 'coolify' | 'aws' | 'auto';

function detectPlatform(): 'coolify' | 'aws' {
  // Check for Coolify API URL first
  if (process.env.COOLIFY_API_URL && process.env.COOLIFY_API_KEY) {
    return 'coolify';
  }

  // Fall back to AWS if credentials available
  if (process.env.AWS_REGION && process.env.ECS_CLUSTER) {
    return 'aws';
  }

  throw new Error(
    'Unable to detect deployment platform. ' +
    'Set DEPLOYMENT_PLATFORM or provide platform-specific environment variables.'
  );
}

export function createPlatformService(): PlatformService {
  const configured = process.env.DEPLOYMENT_PLATFORM as PlatformType || 'auto';
  const platform = configured === 'auto' ? detectPlatform() : configured;

  console.log(`[platform-factory] Using ${platform} deployment platform`);

  if (platform === 'coolify') {
    const coolify = new CoolifyService({
      apiUrl: process.env.COOLIFY_API_URL!,
      apiKey: process.env.COOLIFY_API_KEY!,
    });
    const pool = new BotPoolService(db, coolify);
    return new CoolifyPlatformService(pool, coolify);
  }

  if (platform === 'aws') {
    const ecsClient = new ECSClient({ region: process.env.AWS_REGION });
    return new AWSPlatformService(ecsClient, {
      cluster: process.env.ECS_CLUSTER!,
      subnets: process.env.ECS_SUBNETS!.split(','),
      securityGroups: process.env.ECS_SECURITY_GROUPS!.split(','),
      taskDefinitions: {
        zoom: process.env.ECS_TASK_DEF_ZOOM!,
        teams: process.env.ECS_TASK_DEF_TEAMS!,
        meet: process.env.ECS_TASK_DEF_MEET!,
      },
    });
  }

  throw new Error(`Unknown platform: ${platform}`);
}
```

## Integration with BotDeploymentService

```typescript
// apps/milo/src/server/api/services/bot-deployment-service.ts (updated)

import { PlatformService } from './platform/platform-service';

class BotDeploymentService {
  constructor(
    private db: PrismaClient,
    private platform: PlatformService  // Changed from BotPoolService
  ) {}

  async deployBot(botId: number): Promise<void> {
    const bot = await this.db.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      throw new Error(`Bot not found: ${botId}`);
    }

    const result = await this.platform.deployBot({
      botId: bot.id,
      platform: bot.platform,
      meetingUrl: bot.meetingUrl,
      meetingPassword: bot.meetingPassword,
      botDisplayName: bot.displayName,
      recordingEnabled: bot.recordingEnabled,
      automaticLeave: bot.automaticLeaveConfig,
    });

    // Store platform identifier for later operations
    await this.db.bot.update({
      where: { id: botId },
      data: {
        platformIdentifier: result.identifier,
        connectionUrl: result.connectionUrl,
        status: 'deploying',
      },
    });
  }

  async stopBot(botId: number): Promise<void> {
    const bot = await this.db.bot.findUnique({ where: { id: botId } });
    if (!bot?.platformIdentifier) {
      throw new Error(`Bot not found or not deployed: ${botId}`);
    }

    await this.platform.stopBot(bot.platformIdentifier);
    await this.platform.cleanup(bot.platformIdentifier);

    await this.db.bot.update({
      where: { id: botId },
      data: { status: 'stopped' },
    });
  }

  async getBotStatus(botId: number): Promise<string> {
    const bot = await this.db.bot.findUnique({ where: { id: botId } });
    if (!bot?.platformIdentifier) {
      return 'unknown';
    }

    return this.platform.getBotStatus(bot.platformIdentifier);
  }
}
```

### Changes Summary

- `BotDeploymentService` depends on `PlatformService` interface
- Platform-specific logic fully encapsulated
- Database stores generic `platformIdentifier` (works for both UUID and ARN)
- No changes needed to tRPC routers or application layer

## Environment Variables

### Common

| Variable | Description | Default |
|----------|-------------|---------|
| `DEPLOYMENT_PLATFORM` | Platform to use: `coolify`, `aws`, or `auto` | `auto` |

### Coolify-specific

| Variable | Description | Required |
|----------|-------------|----------|
| `COOLIFY_API_URL` | Coolify API endpoint | Yes |
| `COOLIFY_API_KEY` | Coolify API key | Yes |
| `COOLIFY_PROJECT_UUID` | Project UUID for bot containers | Yes |

### AWS-specific

| Variable | Description | Required |
|----------|-------------|----------|
| `AWS_REGION` | AWS region | Yes |
| `ECS_CLUSTER` | ECS cluster name | Yes |
| `ECS_SUBNETS` | Comma-separated subnet IDs | Yes |
| `ECS_SECURITY_GROUPS` | Comma-separated security group IDs | Yes |
| `ECS_TASK_DEF_ZOOM` | Task definition for Zoom bot | Yes |
| `ECS_TASK_DEF_TEAMS` | Task definition for Teams bot | Yes |
| `ECS_TASK_DEF_MEET` | Task definition for Meet bot | Yes |

## Documentation Updates

After implementation, update these files:

1. **README.md** - Add deployment platform section with quick start for both platforms
2. **docs/plans/2025-12-15-coolify-migration-design.md** - Reference this design as the dual-platform evolution
3. **docs/DEPLOYMENT.md** (new) - Comprehensive deployment guide with:
   - Platform comparison (trade-offs)
   - Environment variable reference
   - Step-by-step setup for both platforms
   - Troubleshooting guide
4. **apps/milo/.env.example** - Add all platform-specific variables with comments
5. **terraform/** - Document as AWS-specific infrastructure (used when `DEPLOYMENT_PLATFORM=aws`)

## File Structure

```
apps/milo/src/server/api/services/
├── platform/
│   ├── platform-service.ts         # Interface definition
│   ├── platform-factory.ts         # Factory function
│   ├── coolify-platform-service.ts # Coolify implementation
│   └── aws-platform-service.ts     # AWS implementation
├── coolify-service.ts              # Existing (unchanged)
├── bot-pool-service.ts             # Existing (unchanged)
├── bot-deployment-service.ts       # Updated to use PlatformService
└── index.ts                        # Updated exports
```

## Implementation Order

1. Create `platform/` directory and interface
2. Implement `CoolifyPlatformService` (wrap existing services)
3. Update `BotDeploymentService` to use interface
4. Verify Coolify still works
5. Implement `AWSPlatformService`
6. Add platform factory with auto-detection
7. Update environment configuration
8. Update documentation (README, DEPLOYMENT.md, .env.example)
9. Test both platforms end-to-end
