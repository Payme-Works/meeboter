import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/server/database/db";
import { botsTable, type ScreenshotData } from "@/server/database/schema";
import {
	compressImage,
	getFileExtension,
	getMimeType,
} from "@/server/utils/image-compression";
import { getBucketName, getS3ClientInstance } from "@/server/utils/s3";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScreenshotType = "error" | "fatal" | "manual" | "state_change";

interface RouteContext {
	params: Promise<{ id: string }>;
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

function validateMiloToken(request: NextRequest): boolean {
	const token = request.headers.get("X-Milo-Token");
	const expectedToken = process.env.MILO_AUTH_TOKEN;

	return Boolean(token && expectedToken && token === expectedToken);
}

// ─── Route Handler ────────────────────────────────────────────────────────────

/**
 * POST /api/bots/[id]/screenshots
 *
 * Receives raw PNG screenshot, compresses to WebP, uploads to S3,
 * and updates the bot's screenshots array.
 *
 * Headers:
 * - X-Milo-Token: Bot authentication token (required)
 *
 * Form data:
 * - file: PNG image buffer (required)
 * - type: "error" | "fatal" | "manual" | "state_change" (required)
 * - state: Current bot state string (required)
 * - trigger: Optional trigger description
 *
 * Returns: ScreenshotData object
 */
export async function POST(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	// Validate authentication
	if (!validateMiloToken(request)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { id } = await context.params;
	const botId = Number.parseInt(id, 10);

	if (Number.isNaN(botId)) {
		return NextResponse.json({ error: "Invalid bot ID" }, { status: 400 });
	}

	// Parse multipart form data
	let formData: FormData;

	try {
		formData = await request.formData();
	} catch {
		return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
	}

	const file = formData.get("file");
	const type = formData.get("type") as ScreenshotType | null;
	const state = formData.get("state") as string | null;
	const trigger = formData.get("trigger") as string | null;

	// Validate required fields
	if (!file || !(file instanceof Blob)) {
		return NextResponse.json(
			{ error: "Missing or invalid file" },
			{ status: 400 },
		);
	}

	if (!type || !["error", "fatal", "manual", "state_change"].includes(type)) {
		return NextResponse.json({ error: "Invalid type" }, { status: 400 });
	}

	if (!state) {
		return NextResponse.json({ error: "Missing state" }, { status: 400 });
	}

	try {
		// Read file buffer
		const arrayBuffer = await file.arrayBuffer();
		const inputBuffer = Buffer.from(arrayBuffer);

		// Compress image to WebP
		const compressed = await compressImage(inputBuffer, {
			quality: 80,
			format: "webp",
		});

		const compressionSavings = (1 - compressed.ratio) * 100;

		console.log(
			`[Screenshot] Bot ${botId}: compressed ${(compressed.originalSize / 1024).toFixed(1)}KB → ${(compressed.compressedSize / 1024).toFixed(1)}KB (${compressionSavings.toFixed(1)}% reduction)`,
		);

		// Generate S3 key
		const uuid = crypto.randomUUID();
		const timestamp = Date.now();

		const extension = getFileExtension(
			compressed.format as "webp" | "jpeg" | "png",
		);

		const key = `bots/${botId}/screenshots/${uuid}-${type}-${timestamp}.${extension}`;

		// Upload to S3
		const s3Client = getS3ClientInstance();

		const putCommand = new PutObjectCommand({
			Bucket: getBucketName(),
			Key: key,
			Body: compressed.data,
			ContentType: getMimeType(compressed.format as "webp" | "jpeg" | "png"),
		});

		await s3Client.send(putCommand);

		// Create screenshot metadata
		const screenshot: ScreenshotData = {
			key,
			capturedAt: new Date(),
			type,
			state,
			trigger: trigger ?? undefined,
		};

		// Update bot's screenshots array in database
		const bot = await db
			.select({ screenshots: botsTable.screenshots })
			.from(botsTable)
			.where(eq(botsTable.id, botId))
			.limit(1);

		if (!bot[0]) {
			return NextResponse.json({ error: "Bot not found" }, { status: 404 });
		}

		const currentScreenshots = (bot[0].screenshots ?? []) as ScreenshotData[];
		const updatedScreenshots = [...currentScreenshots, screenshot].slice(-50);

		await db
			.update(botsTable)
			.set({ screenshots: updatedScreenshots })
			.where(eq(botsTable.id, botId));

		console.log(
			`[Screenshot] Bot ${botId}: uploaded ${type} screenshot, total: ${updatedScreenshots.length}`,
		);

		return NextResponse.json(screenshot, { status: 201 });
	} catch (error) {
		console.error(
			`[Screenshot] Bot ${botId}: upload failed:`,
			error instanceof Error ? error.message : String(error),
		);

		return NextResponse.json(
			{ error: "Screenshot upload failed" },
			{ status: 500 },
		);
	}
}
