"use client";

import { Bot, Clock } from "lucide-react";

interface UsageData {
	date: string;
	botsUsed: number;
	msEllapsed: number;
	estimatedCost: string;
}

export interface UsageTooltipProps {
	active?: boolean;
	payload?: { payload: UsageData }[];
	label?: string;
	metric: "botsUsed" | "msEllapsed" | "estimatedCost";
}

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}

	const seconds = ms / 1000;

	if (seconds < 60) {
		return `${seconds.toFixed(1)}s`;
	}

	const minutes = Math.floor(ms / 60000);
	const subSeconds = Math.floor((ms % 60000) / 1000);

	if (minutes < 60) {
		return `${minutes}m ${subSeconds}s`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return `${hours}h ${remainingMinutes}m`;
}

function formatDate(dateInput: string | undefined): string {
	if (!dateInput) {
		return "Unknown Date";
	}

	let date: Date;

	if (dateInput.includes("T")) {
		date = new Date(dateInput);
	} else {
		const [year, month, day] = dateInput.split("-").map(Number);
		date = new Date(year, month - 1, day);
	}

	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const options: Intl.DateTimeFormatOptions = {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone: userTimezone,
	};

	return date.toLocaleDateString(undefined, options);
}

export function UsageTooltip({
	active,
	payload,
	label,
	metric,
}: UsageTooltipProps) {
	if (!active || !payload?.length) {
		return null;
	}

	const objData = payload[0]?.payload;

	if (!objData) {
		return null;
	}

	return (
		<div className="bg-popover border border-border p-3 min-w-[160px]">
			<p className="text-xs font-medium text-muted-foreground mb-2">
				{formatDate(label)}
			</p>

			<div className="space-y-2">
				<div
					className={`flex items-center justify-between gap-4 ${metric === "botsUsed" ? "text-foreground" : "text-muted-foreground"}`}
				>
					<div className="flex items-center gap-1.5">
						<Bot className="h-3.5 w-3.5" />
						<span className="text-xs">Bots</span>
					</div>
					<span
						className={`tabular-nums ${metric === "botsUsed" ? "text-sm font-semibold" : "text-xs"}`}
					>
						{objData.botsUsed}
					</span>
				</div>

				<div
					className={`flex items-center justify-between gap-4 ${metric === "msEllapsed" ? "text-foreground" : "text-muted-foreground"}`}
				>
					<div className="flex items-center gap-1.5">
						<Clock className="h-3.5 w-3.5" />
						<span className="text-xs">Time</span>
					</div>
					<span
						className={`tabular-nums ${metric === "msEllapsed" ? "text-sm font-semibold" : "text-xs"}`}
					>
						{formatDuration(objData.msEllapsed)}
					</span>
				</div>
			</div>
		</div>
	);
}
