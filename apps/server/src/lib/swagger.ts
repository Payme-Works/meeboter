import { generateOpenApiDocument } from "trpc-to-openapi";

import { appRouter } from "../server/api/root";

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: "Meeting Bot API",
  version: "1.0.0",
  baseUrl: "/api",
});
