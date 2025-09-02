import { generateOpenApiDocument } from "trpc-to-openapi";

import { appRouter } from "../server/api/root";

/**
 * OpenAPI specification document for the Live Boost API
 *
 * Generated from tRPC router definitions using trpc-to-openapi
 * Provides REST API documentation and schema definitions for external integrations
 */
export const openApiDocument = generateOpenApiDocument(appRouter, {
	title: "Live Boost API",
	version: "1.0.0",
	baseUrl: "/api",
});
