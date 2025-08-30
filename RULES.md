# Agent Rules

## General Guidelines

- Follow existing code conventions and patterns in the codebase
- Use existing libraries and frameworks already present in the project
- Never assume libraries are available - always check package.json, requirements.txt, or other dependency files first
- Follow security best practices - never expose secrets or credentials
- Write clean, maintainable code with appropriate error handling
- Use TypeScript strict mode when working with TypeScript files
- Read the `README.md`, `ROADMAP.md` and `ACL.md` files in the root folder first to see the product requirements
- Read `codebase.md` in `/codefetch` folder to see the codebase
- Before coding, write a short plan
- When implementing new features, always consider email notifications and user communication flows
- Research latest documentation when working with third-party libraries (especially authentication libraries like better-auth)
- **VERY IMPORTANT: When you have completed a task, you MUST run the lint and typecheck commands** (eg. `pnpm run lint`, `pnpm tsc --noEmit`, `pnpm run check`) with Bash if they were provided to you to ensure your code is correct. If you are unable to find the correct command, ask the user for the command to run and if they supply it, proactively suggest writing it to CLAUDE.md so that you will know to run it next time.
- **NEVER commit changes unless the user explicitly asks you to** - It is VERY IMPORTANT to only commit when explicitly asked, otherwise the user will feel that you are being too proactive
- **Run build verification** - Always run `pnpm run build` or equivalent build command to ensure the application compiles successfully before completing tasks

## AWS Configuration

- **Default Profile**: `live-boost`
- **Default Region**: `us-east-2`
- Always use the live-boost profile for AWS operations
- S3 bucket for Terraform state: `tf-state-live-boost`

### AWS CLI Commands

Always include the profile and region when running AWS CLI commands:

```bash
aws <service> <command> --profile live-boost --region us-east-2
```

## Terraform Guidelines

- **State Backend**: Store Terraform state in S3 bucket `tf-state-live-boost`
- **Region**: All resources should be deployed to `us-east-2` unless specified otherwise
- Use proper Terraform formatting with `terraform fmt`
- Always run `terraform plan` before `terraform apply`
- Use meaningful resource names with consistent naming conventions
- Tag all resources appropriately for cost tracking and organization

### Terraform Backend Configuration

```hcl
terraform {
  backend "s3" {
    bucket  = "tf-state-live-boost"
    key     = "terraform.tfstate"
    region  = "us-east-2"
    profile = "live-boost"
  }
}
```

### Terraform Provider Configuration

```hcl
provider "aws" {
  region  = "us-east-2"
  profile = "live-boost"
}
```

## Docker Build Guidelines

### Monorepo Docker Builds

- **Always build from monorepo root**: Use `docker build -f apps/<app>/Dockerfile .` 
- **Never build from subdirectories**: Workspace dependencies won't resolve correctly
- **Include workspace context**: Copy `pnpm-workspace.yaml`, root `package.json`, and `packages/` directory
- **Use workspace filtering**: For builds, use `pnpm --filter @package/name build`
- **Protection checks**: All Dockerfiles include root directory validation
- **Disk cleanup**: Run `docker system prune -f --volumes` after builds to manage disk space

### Docker Build Commands

```bash
# Server
docker build -f apps/server/Dockerfile -t live-boost-server .

# Bots  
docker build -f apps/bots/providers/meet/Dockerfile -t live-boost-meet .
docker build -f apps/bots/providers/teams/Dockerfile -t live-boost-teams .
docker build -f apps/bots/providers/zoom/Dockerfile -t live-boost-zoom .
```

## Development Workflow

1. Always check existing code patterns before implementing new features
2. Run linting and type checking before committing changes
3. Test changes thoroughly in development environment
4. Use meaningful commit messages
5. Never commit secrets, API keys, or sensitive information

## Database Migration Rules

- **NEVER run database migrations automatically** - migrations must be explicitly requested by the user
- **NEVER generate migration files** unless specifically asked to do so
- **Always implement schema changes first** in the schema.ts file without running migrations
- **ALWAYS run lint and typecheck after ANY implementation or change** - this is mandatory
- When user requests migration generation, use the appropriate database migration tool (e.g., `drizzle-kit generate`, `prisma migrate dev`)
- Always backup database before running migrations in production environments

## Code Quality

- Write self-documenting code with clear variable and function names
- Add comments only when necessary to explain complex logic
- Follow the principle of single responsibility
- Handle errors gracefully with appropriate logging
- Use consistent indentation and formatting
- **Never use `any` type** - use proper TypeScript types like `Record<string, unknown>` or specific interfaces
- **Avoid unnecessary template literals** - use regular strings for static content
- **Remove trailing whitespace** - ensure clean code formatting
- **Never keep unused variables, functions, interfaces, or imports** - Remove all unused code elements to maintain a clean codebase
- **Remove unused Array.from parameters** - When the index parameter isn't used in `Array.from().map()`, remove it entirely
- **Use proper TypeScript types instead of `any`** - Replace explicit `any` types with proper interfaces, unions, or `unknown`
- **Avoid non-null assertions** - Replace `!` assertions with safe null checks and fallback values
- **Use Number.isNaN instead of isNaN** - Replace deprecated `isNaN()` with `Number.isNaN()`
- **Avoid biome-ignore comments unless absolutely necessary** - Only use suppression comments for legitimate cases
- **Use Prisma-generated types instead of custom types** - Always prefer `Prisma.ModelWhereInput`, `Prisma.ModelGetPayload<T>`
- **Next.js route parameters are promises** - In App Router, route parameters must be typed as `Promise<{ id: string }>` and awaited
- **Proper enum type casting** - Cast string values to proper enum types when needed
- **Component interface consistency** - Ensure component prop interfaces match actual usage
- **Browser API type safety** - Define minimal interface types for browser APIs when TypeScript definitions are missing
- **Extract inline types to interfaces** - Prefer defining types and interfaces separately rather than inline

## Security

- Never hardcode credentials or API keys
- Use environment variables for configuration
- Validate all inputs
- Follow principle of least privilege for AWS IAM roles and policies
- Keep dependencies updated and scan for vulnerabilities

## Code Formatting

### Action Block Spacing Rule

When writing code blocks that contain:
1. A message announcing an action
2. One or more commands/statements performing the action  
3. A message confirming completion

**Format:**
```
action_start_message

command1
command2

action_completion_message
```

**Rationale:** Blank lines visually separate the action messages from the actual commands/statements, improving readability and making the code structure clearer.

## Naming Conventions

- **Avoid "Info" and "Data" suffixes in nomenclatures** - Instead of `CampaignInfo` or `CampaignData`, use just `Campaign`
- **Use clear, descriptive names** - Function and variable names should clearly indicate their purpose
- **Prefer simple, direct naming** - Avoid unnecessary complexity in naming conventions
- **Use hyphen-case for file names** - Use hyphens instead of dots in file names (e.g., `webhook-processor-service.ts` instead of `webhook-processor.service.ts`)

## File Structure & Organization

- **Never create index.ts files for re-exports only** - Do not create index.ts files that only re-export other files. Import directly from source files
- **One component per file** - Never create multiple components in the same file
- **Next.js page components** - Organize page-specific components under a `_components` folder at the same level as the `page.tsx` file

## Code Style

### JSX Element Spacing
Always add a blank line between adjacent JSX elements to improve code readability.

### Function Declaration Style
Prefer using named function declarations instead of arrow functions, except when passing a function as a parameter or argument.

### Statement Padding
Ensure there is a blank line before and after major code blocks to improve readability and code separation.

### Class Concatenation
Always use the `cn` utility function from `@/lib/utils` for concatenating CSS classes in JSX elements.

### Array Keys for Fake Data
When creating arrays with fake data for loading skeletons or mock data, use `Math.random()` to generate unique keys.

## Error Handling

- **Functions should not be entirely wrapped in try-catch blocks** - Library functions should not catch errors internally
- **Use try-catch at function usage points** - Wrap individual function calls in try-catch blocks where they are used
- **Preserve error stack traces** - This approach provides cleaner code and better error handling flexibility
- **Handle errors gracefully** - When catching errors at usage points, provide meaningful error messages and fallback behavior

## Email System

- **Use email templates** for all user communications instead of inline HTML
- **Use appropriate email types** (`EmailType.AUTH`, `EmailType.NOTIFICATIONS`, etc.) to ensure proper sender addresses
- **Include proper error handling** for email sending operations with console logging
- **Use white-label configuration** to ensure emails match the brand/domain
- **Send registration emails immediately** after successful user registration in authentication hooks

## Authentication

- **Use better-auth hooks** for lifecycle events (registration, password reset, etc.)
- **Send emails in after hooks** to ensure they only trigger after successful operations  
- **Include proper error handling** for authentication-related email sending
- **Use appropriate email types** for authentication emails (`EmailType.AUTH`)

## Component Standards

- **Use standard UI components** - Always use the correct, standardized components from the design system
- **Delete unnecessary custom components** - Remove custom implementations when standard alternatives exist
- **Maintain consistency with design system** - Prefer established UI patterns over custom implementations
- **Refactor deprecated components** - When removing custom components, refactor all usages to use proper standard components

## Code Quality & Maintenance

- **Fix all linting warnings** - Maintain a clean codebase with zero linting warnings through systematic fixes
- **Use modern browser APIs safely** - Replace deprecated APIs with modern alternatives where appropriate
- **Handle browser compatibility** - Use proper TypeScript type assertions for cross-browser APIs
- **Systematic error resolution** - Address warnings methodically by category
- **Track progress during large refactoring** - Use todo lists and systematic approaches when fixing multiple related issues
