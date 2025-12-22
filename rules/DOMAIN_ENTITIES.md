# Domain Entity Patterns

This document contains domain entity validation patterns, synchronization standards, and repository design guidelines.

## Validation Method Structure

```typescript
// ✅ CORRECT: Individual validation functions called directly in constructor
constructor(props, id) {
    // Validate data before calling super()
    Entity.validateField1(props.field1);
    Entity.validateField2(props.field2);
    Entity.validateField3(props.field3);

    super({ ...props, ... }, id);
}

// ❌ WRONG: Wrapper validation functions
constructor(props, id) {
    Entity.validateAllData(props); // Don't do this
    super({ ...props, ... }, id);
}
```

## Constructor Parameter Block Spacing

```typescript
// ✅ CORRECT: Blank lines between contextual blocks
constructor(props, id) {
    super(
        {
            ...props,

            status: props.status || PayoutStatus.REQUESTED,

            createdAt: props.createdAt ?? new Date(),
            updatedAt: props.updatedAt ?? new Date(),
        },
        id,
    );

    this.validate();
}

// ❌ WRONG: No spacing between blocks
constructor(props, id) {
    super(
        {
            ...props,
            status: props.status || PayoutStatus.REQUESTED,
            createdAt: props.createdAt ?? new Date(),
            updatedAt: props.updatedAt ?? new Date(),
        },
        id,
    );

    this.validate();
}
```

## Required vs Optional Field Handling

- **Required fields** - Only validate consistency, no fallback logic with `||`
- **Optional fields** - Can have fallback logic if needed
- **Never use fallback logic** for required fields like `currencyType`

## Static Method Pattern

```typescript
// All validation methods must be static
private static validateField(field: Type): void {
    if (/* validation logic */) {
        throw new EntityError("Error message");
    }
}

// For methods with multiple parameters (3-4+), use object parameter pattern
private static validatePaymentMethod(args: {
    currencyType: CurrencyType;
    pixKeyType?: PixKeyType;
    pixKey?: string;
    cryptoNetwork?: CryptoNetwork;
    cryptoAddress?: string;
}): void {
    if (params.currencyType === CurrencyType.FIAT) {
        // validation logic
    }
}
```

## Constructor Validation Order

1. Call validation functions BEFORE `super()`
2. Use static validation methods with class name prefix
3. Never access `this` before `super()` is called
4. Group all validations together at the start

## Entity Synchronization Standards

- **Match Prisma schema exactly** - Entity fields must match corresponding Prisma models
- **Follow field ordering** - Use the same field ordering and block separation as Prisma schema
- **Remove obsolete fields** - Delete fields that no longer exist in Prisma schema
- **Add missing fields** - Include fields that exist in Prisma but not in entities
- **Update test files** - Ensure tests don't reference deleted fields
- **Update factory functions** - Match new entity interfaces

## Entity Synchronization Workflow

1. **Examine Prisma schema** - Understand current structure of models including all fields, types, and relationships
2. **Review domain entities** - Compare entities with schema to identify mismatches, missing fields, or obsolete fields
3. **Update entities** - Synchronize fields, types, validation patterns, and field ordering to match Prisma schema exactly
4. **Update database mappers** - Ensure proper mapping between domain entities and Prisma models with correct field mappings
5. **Update test files** - Remove references to deleted fields, add tests for new fields, update factory functions
6. **Update entity documentation** - **ALWAYS update corresponding `.md` files** in `/packages/core/src/domain/entities/` to reflect entity changes including new fields, methods, validation rules, and usage examples
7. **Run validation** - TypeScript compilation, entity instantiation tests, mapper functionality verification

## Entity Documentation Requirements

- **MANDATORY** - Update entity `.md` documentation files after any entity synchronization
- Include all new fields in properties tables with proper types and descriptions
- Document new validation methods and business rules
- Update usage examples to reflect current entity structure
- Ensure field ordering in documentation matches entity implementation
- Maintain consistency between documentation and actual code

## Database Mapper Synchronization Workflow

When entities are updated, the corresponding database mappers MUST also be synchronized:

### Mapper Update Process
1. **Examine current mappers** in `/packages/database/src/mappers/` directory
2. **Compare with updated entities** to identify synchronization needs
3. **Update mapper field mappings** to match entity property changes exactly
4. **Remove obsolete field mappings** for fields deleted from entities
5. **Add mappings for new fields** that were added to entities
6. **Update type imports** and ensure proper type casting between domain and database layers
7. **Create missing mappers** for new entities (Account, Session, etc.)
8. **Verify type safety** by running TypeScript compiler checks

### Mapper Structure Standards
```typescript
export class PrismaEntityMapper {
    // Convert Prisma raw data to domain entity
    static toDomain(raw: RawPrismaEntity): Entity {
        return new Entity({
            // Field mappings matching entity interface exactly
            field1: raw.field1,
            field2: raw.field2 ?? undefined, // Handle nullable fields
            // Relationship mappings
            relatedEntity: raw.relatedEntity
                ? PrismaRelatedEntityMapper.toDomain(raw.relatedEntity)
                : undefined,
        }, raw.id);
    }

    // Convert domain entity to Prisma create/update input
    static toPrisma(entity: Entity): Prisma.EntityCreateInput {
        return {
            id: entity.id,
            field1: entity.field1,
            field2: entity.field2,
            // Connection mappings for relationships
            relatedEntity: entity.relatedEntityId ? {
                connect: { id: entity.relatedEntityId }
            } : undefined,
        };
    }
}
```

### RawPrisma Type Updates
When entities change relationships, update the corresponding `RawPrismaType` in `/packages/database/src/models/`:
```typescript
export type RawPrismaEntity = Partial<
    Prisma.EntityGetPayload<{
        include: {
            // Include all relationships that mappers access
            relatedEntity: true;
            collections: true;
        };
    }>
> & PrismaEntity;
```

### Mapper Method Standards
- **NEVER create separate `toPrismaUpdate` methods** - Use a single `toPrisma` method for both create and update operations
- **Use `toPrisma` for all database writes** - Whether creating or updating, always use `Mapper.toPrisma(entity)` as the `data` parameter

```typescript
// ✅ CORRECT: Single toPrisma method for both create and update
await this.prisma.entity.create({
    data: PrismaEntityMapper.toPrisma(entity),
});

await this.prisma.entity.update({
    where: { id: entity.id },
    data: PrismaEntityMapper.toPrisma(entity),
});

// ❌ WRONG: Separate toPrismaUpdate method
await this.prisma.entity.update({
    where: { id: entity.id },
    data: PrismaEntityMapper.toPrismaUpdate(entity), // Don't do this
});
```

### Mapper Quality Checks
- Ensure all entity properties have corresponding mappings
- Handle nullable fields properly with `?? undefined`
- Use proper type casting for enums and complex types
- Maintain consistent error handling patterns
- Verify relationship mappings work in both directions
- Test that mappers can handle partial data gracefully

## Lint and Quality Standards

- Always run `bun turbo lint` after entity changes
- Fix `noUnreachableSuper` errors by making validations static
- Replace `isNaN()` with `Number.isNaN()` for better practice
- Use proper TypeScript types, avoid `any`

## Documentation Standards

- Improve JSDoc comments for clarity and readability
- Document all parameters, return values, and thrown errors
- Use consistent documentation patterns across entities
- Include field descriptions that match Prisma schema comments

## Anti-Patterns to Avoid

- Don't create wrapper validation functions that call other validations
- Don't use fallback logic (`||`) for required fields
- Don't access `this` before calling `super()`
- Don't keep obsolete fields that don't exist in Prisma schema
- Don't create multiple components in the same file
- Don't use instance validation methods in constructors
- Prefer to don't use "any" as type

## Repository Design Standards

### Minimal Function Implementation
- **Create only necessary functions** - Never implement more methods than are actually being used in the codebase
- **Check usage before implementation** - Always verify which methods are actually called before implementing repository contracts
- **Avoid comprehensive interfaces** - Don't create "complete" repository interfaces with every possible CRUD operation if they're not needed
- **Remove unused methods** - Regularly clean up repository implementations by removing methods that are never called
- **Start minimal, add as needed** - Begin with only the essential methods and add more only when there's a concrete use case

### Repository Contract Guidelines
- **Essential methods only** - Include only `create`, `findById`, `save`, `delete` and specific query methods that are actually used
- **Avoid generic query methods** - Don't implement `findMany`, `count`, `exists` unless they have specific use cases
- **Remove unused imports** - Clean up type imports that are no longer needed after removing unused methods
- **Keep implementations simple** - Focus on the core functionality rather than comprehensive feature sets

## Specialized Agent Usage

### Domain Entity Sync Agent
- **Use for entity synchronization** - When synchronizing domain entities with Prisma schema changes
- **Field consistency tasks** - Updating entity fields to match database models, fixing validation patterns, ensuring entity-schema consistency
- **Systematic updates** - Tasks like updating entities after schema migrations, adding missing fields from Prisma models, removing obsolete entity fields
- **Example usage** - Field renaming operations (e.g., `amount` → `grossAmount`), schema migration synchronization

### Agent Selection Guidelines
- **Use specialized agents proactively** - When task matches agent description, use the appropriate agent for better results
- **Domain-focused agents** - Prefer specialized agents for domain-specific tasks like entity synchronization
- **Tool availability** - Use Task tool with specialized agents when available for complex, multi-step operations
- **Agent capabilities** - Specialized agents have access to all tools (*) and can perform comprehensive analysis and updates
