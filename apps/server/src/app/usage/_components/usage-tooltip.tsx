"use client";

// Define the data structure
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

export const UsageTooltip = ({
	active,
	payload,
	label,
	metric,
}: UsageTooltipProps) => {
	if (!active || !payload?.length) {
		return null;
	}

	const objData = payload[0]?.payload;

	if (!objData) {
		return null;
	}

	// Render
	const activeMutation = "font-semibold text-lg";

	const checkActive = (check: string) =>
		metric === check ? activeMutation : "";

	// Format
	const formatDuration = (ms: number): string => {
		if (ms < 1000) {
			return `${ms} ms`;
		}

		const seconds = ms / 1000;

		if (seconds < 60) {
			return `${seconds.toFixed(1)} seconds`;
		}

		const minutes = Math.floor(ms / 60000);
		const subSeconds = Math.floor((ms % 60000) / 1000);

		if (minutes < 60) {
			return `${minutes} minutes ${subSeconds} seconds`;
		}

		const hours = Math.floor(minutes / 60);
		const remainingMinutes = minutes % 60;

		return `${hours} hours ${remainingMinutes} minutes`;
	};

	// Format Date - handle both ISO timestamps and date strings
	const formatDate = (dateInput: string | undefined): string => {
		if (!dateInput) {
			return "Unknown Date";
		}

		// Handle different date formats from server
		let date: Date;

		if (dateInput.includes("T")) {
			// Full ISO timestamp like "2025-08-30T03:00:00.000Z"
			date = new Date(dateInput);
		} else {
			// Date string like "2025-08-30" - parse as local midnight instead of UTC
			// This ensures the date represents the correct day in user's timezone
			const [year, month, day] = dateInput.split("-").map(Number);
			date = new Date(year, month - 1, day);
		}

		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		const options: Intl.DateTimeFormatOptions = {
			year: "numeric",
			month: "long",
			day: "numeric",
			timeZone: userTimezone,
		};

		const formattedDate = date.toLocaleDateString(undefined, options);

		// Get day in user's timezone
		const dayInUserTz = date.toLocaleDateString("en-CA", {
			timeZone: userTimezone,
			day: "numeric",
		});

		const day = parseInt(dayInUserTz, 10);

		const suffix =
			day % 10 === 1 && day !== 11
				? "st"
				: day % 10 === 2 && day !== 12
					? "nd"
					: day % 10 === 3 && day !== 13
						? "rd"
						: "th";

		return formattedDate.replace(/\d+/, `${day}${suffix}`);
	};

	return (
		<div className="rounded-md border bg-white p-3">
			<p className="pb-2 font-semibold">{formatDate(label)}</p>

			<p className={`text-grey-500 ${checkActive("botsUsed")}`}>
				Bots Used: {objData.botsUsed}
			</p>

			<p className={`text-grey-600 ${checkActive("msEllapsed")}`}>
				Total Time: {formatDuration(objData.msEllapsed)}
			</p>
		</div>
	);
};
