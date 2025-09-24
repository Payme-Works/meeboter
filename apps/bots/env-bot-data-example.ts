import fs from "node:fs";
import path from "node:path";
import type { BotConfig } from "./src/types";

/**
 * Bot Data Environment Variable Generator
 *
 * This script creates the BOT_DATA environment variable for bot testing locally.
 *
 * Usage:
 * 1. Copy this script to env-bot-data.ts (will be git-ignored)
 * 2. Fill in the <...> placeholders with actual values
 * 3. Ensure .env file exists in this directory without BOT_DATA variable
 * 4. Run: pnpm tsx env-bot-data.ts
 */

// ============================================================================
// Configuration
// ============================================================================

// Paste your meeting URL here
const url = "<MEETING_URL>";

const botData: BotConfig = {
	id: 1,
	userId: "<USER_ID>",
	meetingInfo: {}, // Empty - filled by URL parsing for platform-specific format
	meetingTitle: "Test Meeting",
	startTime: new Date(),
	endTime: new Date(),
	botDisplayName: "John Doe",
	botImage: undefined,
	heartbeatInterval: 10000,
	automaticLeave: {
		waitingRoomTimeout: 3600000,
		noOneJoinedTimeout: 3600000,
		everyoneLeftTimeout: 3600000,
		inactivityTimeout: 3600000,
	},
	callbackUrl: "<CALLBACK_URL>",
	recordingEnabled: false,
	chatEnabled: false,
};

// ============================================================================
// Meeting Link Validation & Parsing
// ============================================================================

/**
 * Validates Google Meet bot links
 */
const checkMeetBotLink = (link: string) => {
	return /^((https:\/\/)?meet\.google\.com\/)?[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(
		link,
	);
};

/**
 * Validates Zoom bot links
 */
const checkZoomBotLink = (link: string) => {
	// Match any zoom.us subdomain followed by /j/ and 9-11 digits
	return /^https:\/\/[a-z0-9]+\.zoom\.us\/j\/[0-9]{9,11}(?:\?pwd=[^&]+)?$/.test(
		link,
	);
};

/**
 * Parses Teams meeting links to extract meeting ID, tenant ID, and organization ID
 */
function parseTeamsMeetingLink(url: string) {
	try {
		const urlObj = new URL(url);
		const pathSegments = urlObj.pathname.split("/");

		// Extract meeting ID (after "19:meeting_")
		let meetingId: string | null = null;

		const meetingSegment = pathSegments.find(
			(segment) =>
				segment.startsWith("19%3ameeting_") ||
				segment.startsWith("19:meeting_"),
		);

		if (meetingSegment) {
			const s = meetingSegment.split("meeting_")[1];

			if (!s) return null;

			meetingId = meetingSegment ? decodeURIComponent(s).split("@")[0] : null;
		}

		// Extract tenant ID and organization ID from context parameter
		const params = new URLSearchParams(urlObj.search);
		const context = params.get("context");

		let tenantId = null;
		let organizationId = null;

		if (context) {
			const contextObj = JSON.parse(decodeURIComponent(context));
			tenantId = contextObj.Tid || null;
			organizationId = contextObj.Oid || null;
		}

		console.log("Teams: found: ", meetingId, tenantId, organizationId);

		if (meetingId === null || tenantId === null || organizationId === null) {
			return null;
		}

		return { meetingId, tenantId, organizationId };
	} catch (_error) {
		// Uncomment to debug URL format changes
		// console.error("Error parsing Teams meeting link:", error);
		return null;
	}
}

/**
 * Validates Teams bot links
 */
const checkTeamsBotLink = (link: string) => {
	return parseTeamsMeetingLink(link) !== null;
};

// Link validation functions for each platform
const linkParsers: Record<MeetingType, (link: string) => boolean> = {
	meet: checkMeetBotLink,
	zoom: checkZoomBotLink,
	teams: checkTeamsBotLink,
};

/**
 * Parses Zoom meeting links to extract meeting ID and password
 */
function parseZoomMeetingLink(url: string) {
	try {
		const urlObj = new URL(url);
		const pathSegments = urlObj.pathname.split("/");
		const meetingId = pathSegments[pathSegments.length - 1];
		const meetingPassword = urlObj.searchParams.get("pwd") || "";

		return {
			meetingId,
			meetingPassword,
		};
	} catch (error) {
		console.error("Error parsing Zoom meeting link:", error);

		return null;
	}
}

type MeetingType = "meet" | "zoom" | "teams";

// ============================================================================
// Meeting Info Generation
// ============================================================================

/**
 * Generates platform-specific meeting information from a meeting link
 */
const defineMeetingInfo = (link: string) => {
	console.log("Splitting Meeting Link");

	// Determine meeting platform type
	const parseMeetingLink = () => {
		if (!link) return undefined;

		// Check each platform's link format

		for (const [key, checkFunction] of Object.entries(linkParsers)) {
			if (checkFunction(link)) {
				return key as MeetingType;
			}
		}

		return undefined;
	};

	const type = parseMeetingLink();
	console.log("Detected type", type);

	// Google Meet
	if (type === "meet") {
		// Ensure proper URL format
		if (!link.startsWith("https://meet.google.com/"))
			link = `https://meet.google.com/${link}`;

		if (!link.startsWith("https://")) link = `https://${link}`;

		return {
			meetingUrl: link,
			platform: "google",
		};
	}

	// Zoom
	if (type === "zoom") {
		const parsed = parseZoomMeetingLink(link);

		if (!parsed) return undefined;

		return {
			platform: "zoom",
			meetingId: parsed.meetingId,
			meetingPassword: parsed.meetingPassword,
		};
	}

	// Teams
	if (type === "teams") {
		const parsed = parseTeamsMeetingLink(link);

		if (!parsed) return undefined;

		const { meetingId, organizationId, tenantId } = parsed;

		return {
			platform: "teams",
			meetingId,
			organizerId: organizationId,
			tenantId,
		};
	}

	return undefined;
};

// ============================================================================
// Environment File Update
// ============================================================================

// Update .env file with BOT_DATA variable
const envFilePath = path.join(__dirname, ".env");
let envFileContent = fs.readFileSync(envFilePath, "utf8");

// Remove existing BOT_DATA line if present
envFileContent = envFileContent.replace(/BOT_DATA=.*\n?/, "");

// Generate meeting info and update environment file
const meetingInfo = defineMeetingInfo(decodeURI(url));
const updatedEnvFileContent = `${envFileContent}\nBOT_DATA=${JSON.stringify({ ...botData, meetingInfo })}`;

if (meetingInfo) {
	fs.writeFileSync(envFilePath, updatedEnvFileContent);
	console.log("BOT_DATA variable updated in .env file");
} else {
	console.log("No valid meeting info found - .env file not updated");
}
