/**
 * Detect if colors should be enabled.
 * Disabled in non-TTY environments (AWS CloudWatch, Docker logs, etc.)
 */
const COLORS_ENABLED =
	process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",

	// Foreground colors
	gray: "\x1b[90m",
	cyan: "\x1b[36m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	white: "\x1b[37m",

	// Background colors
	bgRed: "\x1b[41m",
} as const;

/**
 * Wraps text with ANSI color codes (only when colors are enabled)
 */
function colorize(text: string, ...codes: string[]): string {
	if (!COLORS_ENABLED) {
		return text;
	}

	return `${codes.join("")}${text}${COLORS.reset}`;
}

/**
 * Color functions for each log level
 */
export const levelColors = {
	TRACE: (text: string) => colorize(text, COLORS.gray),
	DEBUG: (text: string) => colorize(text, COLORS.cyan),
	INFO: (text: string) => colorize(text, COLORS.green),
	WARN: (text: string) => colorize(text, COLORS.yellow),
	ERROR: (text: string) => colorize(text, COLORS.red),
	FATAL: (text: string) => colorize(text, COLORS.bold, COLORS.red),
} as const;

/**
 * Colorize the log level badge
 */
export function colorizeLevel(level: keyof typeof levelColors): string {
	const padded = level.padEnd(5);

	return levelColors[level](`[${padded}]`);
}

/**
 * Colorize bot ID
 */
export function colorizeBotId(botId: number): string {
	return colorize(`[bot:${botId}]`, COLORS.white);
}

/**
 * Colorize bot state
 */
export function colorizeState(state: string): string {
	return colorize(`[${state}]`, COLORS.cyan);
}

/**
 * Colorize file location
 */
export function colorizeLocation(location: string): string {
	return colorize(`[${location}]`, COLORS.gray);
}

/**
 * Colorize elapsed time
 */
export function colorizeElapsed(elapsed: string): string {
	return colorize(`[${elapsed}]`, COLORS.gray);
}

/**
 * Colorize error details (stack trace, breadcrumbs)
 */
export function colorizeErrorDetail(text: string): string {
	return colorize(text, COLORS.gray);
}

/**
 * Colorize breadcrumb prefix based on level
 */
export function colorizeBreadcrumbLevel(level: string): string {
	const colorFn =
		levelColors[level as keyof typeof levelColors] || levelColors.INFO;

	return colorFn(level);
}
