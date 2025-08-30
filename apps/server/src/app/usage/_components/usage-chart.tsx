"use client";

import React, { useEffect, useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import ErrorAlert from "@/components/custom/error-alert";
import { Button } from "@/components/ui/button"; // Assuming you're using shadcn/ui
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { UsageTooltip } from "./usage-tooltip";

// Define a proper type for the usage data
interface UsageData {
	date: string;
	botsUsed: number;
	msEllapsed: number;
	estimatedCost: string;
}

export interface UsageChartProps {
	data: UsageData[];
	dataLoading: boolean;
}

export function UsageChart() {
	// Get Metric - default to count since estimatedCost is disabled
	const [metric, setMetric] = React.useState<
		"botsUsed" | "msEllapsed" | "estimatedCost"
	>("botsUsed");

	const [timeframe, setTimeframe] = React.useState<"daily" | "week" | "month">(
		"week",
	);

	const [isMobile, setIsMobile] = useState(false);

	// Initialize window-dependent states safely
	useEffect(() => {
		setIsMobile(window.innerWidth < 768);

		const handleResize = () => {
			setIsMobile(window.innerWidth < 768);
		};

		window.addEventListener("resize", handleResize);

		return () => window.removeEventListener("resize", handleResize);
	}, []);

	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Load the Data with timezone support
	const dailyData = api.usage.getDailyUsage.useQuery(
		{ timeZone: userTimezone },
		{ enabled: timeframe === "daily" && !!userTimezone },
	);

	const weekData = api.usage.getWeekDailyUsage.useQuery(
		{ timeZone: userTimezone },
		{ enabled: timeframe === "week" && !!userTimezone },
	);

	const monthData = api.usage.getMonthDailyUsage.useQuery(
		{ timeZone: userTimezone },
		{ enabled: timeframe === "month" && !!userTimezone },
	);

	const { data, isLoading, error } =
		timeframe === "daily"
			? dailyData
			: timeframe === "week"
				? weekData
				: monthData;

	// Decide scale
	const max =
		data &&
		Math.max(
			...data.map((d) => {
				if (typeof d[metric] === "number") {
					return d[metric];
				}

				return Math.ceil(parseFloat(d[metric]));
			}),
		);

	const ydomain = data && [0, max ?? 0];

	const dateTickFormatter = (date: string) => {
		// Handle different date formats from server
		let parsedDate: Date;

		if (date.includes("T")) {
			// Full ISO timestamp like "2025-08-30T03:00:00.000Z" (daily)
			parsedDate = new Date(date);
		} else {
			// Date string like "2025-08-30" (week/month) - parse as local midnight
			// This ensures the date represents the correct day in user's timezone
			const [year, month, day] = date.split("-").map(Number);
			parsedDate = new Date(year, month - 1, day);
		}

		if (timeframe === "daily") {
			// Format as hour in local timezone
			return parsedDate.toLocaleString("default", {
				hour: "numeric",
				hour12: true,
				timeZone: userTimezone,
			});
		} else if (timeframe === "week") {
			// Format as weekday in user timezone
			return parsedDate.toLocaleString("default", {
				weekday: "short",
				timeZone: userTimezone,
			});
		} else {
			// Format as month and day in user timezone
			return parsedDate.toLocaleDateString("default", {
				month: "short",
				day: "numeric",
				timeZone: userTimezone,
			});
		}
	};

	return (
		<div>
			<div
				className={`flex ${isMobile ? "flex-col" : "justify-between"} mt-4 w-full gap-2`}
			>
				<div className="align-center flex flex-col justify-center">
					<div className="pb-2 font-semibold">Time Span</div>

					<div className="flex gap-2">
						<Button
							data-testid="month-button"
							variant={timeframe === "month" ? "default" : "outline"}
							onClick={() => setTimeframe("month")}
						>
							This Month
						</Button>

						<Button
							data-testid="week-button"
							variant={timeframe === "week" ? "default" : "outline"}
							onClick={() => setTimeframe("week")}
						>
							This Week
						</Button>

						<Button
							data-testid="daily-button"
							variant={timeframe === "daily" ? "default" : "outline"}
							onClick={() => setTimeframe("daily")}
						>
							Today
						</Button>
					</div>
				</div>

				<div className="align-center flex flex-col justify-center">
					<div className="pb-2 font-semibold">Metric</div>

					<div className="flex gap-2">
						{/* Estimated Costs disabled - pay-as-you-go feature not available yet */}
						{/* <Button
							variant={metric === "estimatedCost" ? "default" : "outline"}
							onClick={() => setMetric("estimatedCost")}
							disabled
						>
							Estimated Costs
						</Button> */}

						<Button
							variant={metric === "botsUsed" ? "default" : "outline"}
							onClick={() => setMetric("botsUsed")}
						>
							Bots Used
						</Button>

						<Button
							variant={metric === "msEllapsed" ? "default" : "outline"}
							onClick={() => setMetric("msEllapsed")}
						>
							Active Bot Time
						</Button>
					</div>
				</div>
			</div>

			{/* Chart */}
			<div className="mt-6">
				{/* Timezone indicator */}
				{userTimezone && (
					<div className="mb-2 text-xs text-muted-foreground">
						Showing times in {userTimezone.replace("_", " ")}
					</div>
				)}

				{data && data.length > 0 ? (
					<div data-testid="chart-container" className="h-full w-full">
						<ResponsiveContainer width="100%" height={300}>
							<LineChart data={data}>
								<CartesianGrid strokeDasharray="3 3" />

								<XAxis
									dataKey="date"
									tickFormatter={dateTickFormatter} // Format YYYY-MM-DD
								/>

								<YAxis
									domain={ydomain}
									allowDecimals={false}
									tickFormatter={
										metric === "msEllapsed"
											? (value) => (value / 60000).toFixed(2)
											: undefined
									}
								/>

								<Tooltip content={<UsageTooltip metric={metric} />} />

								{/* Define the Line */}
								<Line
									type="monotone"
									dataKey={metric}
									stroke="#6366f1"
									strokeWidth={2}
									dot={{ r: 0 }}
									activeDot={{ r: 6 }}
									animationDuration={500} // Speed up animation (default is 1500)
								/>
							</LineChart>
						</ResponsiveContainer>
					</div>
				) : isLoading ? (
					<Skeleton className="w-full mt-2 h-[300px]" />
				) : error ? (
					<ErrorAlert errorMessage={error.message} />
				) : (
					<div>No Data</div>
				)}
			</div>
		</div>
	);
}
