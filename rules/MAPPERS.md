# Mapper Pattern

Mappers are responsible for converting data between different layers or systems (domain ↔ external APIs, domain ↔ database, etc.).

## Structure

Mapper classes should:
- Be placed in a `mappers/` folder adjacent to the service/module they support
- Use static methods for all conversions
- Follow consistent naming conventions

## Naming Convention

```
<Context>Mapper
```

Examples:
- `CoolifyStatusMapper` - Maps Coolify API status to domain status
- `AWSStatusMapper` - Maps AWS ECS status to domain status
- `BotMapper` - Maps bot database records to domain objects

## Required Methods

### `toDomain(externalData): DomainType`

Converts external data (API response, database record) to domain representation.

```typescript
static toDomain(coolifyStatus: string): CoolifyBotStatus {
    const status = coolifyStatus.toLowerCase();

    if (status === "running" || status === "healthy") {
        return "HEALTHY";
    }

    // ... other mappings

    return "ERROR"; // Default fallback
}
```

### `toPlatform(domainData): ExternalType` (optional)

Converts domain data back to external format when needed.

```typescript
static toPlatform(domainStatus: CoolifyBotStatus): string {
    switch (domainStatus) {
        case "HEALTHY":
            return "running";
        case "IDLE":
            return "stopped";
        // ...
    }
}
```

### `toPrisma(domainData): PrismaType` (for database mappers)

Converts domain data to Prisma/Drizzle format for database operations.

## File Organization

```
services/
  platform/
    mappers/
      coolify-status-mapper.ts
      aws-status-mapper.ts
      k8s-status-mapper.ts
    coolify-platform-service.ts
    aws-platform-service.ts
```

## Usage in Services

```typescript
import { CoolifyStatusMapper } from "./mappers/coolify-status-mapper";

class CoolifyPlatformService {
    async getBotStatus(identifier: string): Promise<CoolifyBotStatus> {
        const status = await this.coolifyService.getApplicationStatus(identifier);
        return CoolifyStatusMapper.toDomain(status);
    }
}
```

## Key Principles

1. **Single Responsibility**: Each mapper handles one type of conversion
2. **Pure Functions**: Mapping methods should be pure with no side effects
3. **Exhaustive Handling**: Handle all possible input values, provide sensible defaults
4. **Type Safety**: Use explicit return types, avoid `any`
5. **No Business Logic**: Mappers only transform data, business logic belongs in services
