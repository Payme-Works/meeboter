/**
 * Database Schema Barrel Export
 *
 * Re-exports all tables, types, and validation schemas for backward compatibility.
 * Import from this file to maintain existing import paths:
 *
 * @example
 * import { botsTable, Status, insertBotSchema } from "@/server/database/schema";
 */

// API keys, subscriptions, and request logs
export * from "./api";

// Bots and events
export * from "./bots";

// Messaging (templates and chat)
export * from "./messaging";

// Bot pool management
export * from "./pool";
// Users and authentication
export * from "./users";
