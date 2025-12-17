"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import ErrorAlert from "@/components/custom/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { UsageTooltip } from "./usage-tooltip";

interface UsageData {
	date: string;
	botsUsed: number;
	msEllapsed: number;
	estimatedCost: string;
}

type Timeframe = "daily" | "week" | "month";

type Metric = "botsUsed" | "msEllapsed";

function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
}) {
	return (
		<div className="inline-flex bg-muted p-1 gap-0.5">
			{options.map((option) => (
				<button
					key={option.value}
					type="button"
					onClick={() => onChange(option.value)}
					className={`
						relative px-3 py-1.5 text-xs font-medium transition-all duration-200
						${
							value === option.value
								? "bg-background text-foreground"
								: "text-muted-foreground hover:text-foreground"
						}
					`}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

interface ChartContentProps {
	data: UsageData[] | undefined;
	isLoading: boolean;
	error: { message: string } | null;
	ydomain: [number, number] | undefined;
	metric: Metric;
	dateTickFormatter: (date: string) => string;
}

function ChartContent({
	data,
	isLoading,
	error,
	ydomain,
	metric,
	dateTickFormatter,
}: ChartContentProps) {
	if (isLoading) {
		return (
			<div className="relative">
				<Skeleton className="w-full h-[320px]" />
				<div className="absolute inset-0 flex items-center justify-center">
					<div className="flex items-center gap-2 text-muted-foreground">
						<motion.div
							animate={{ rotate: 360 }}
							transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
							className="h-4 w-4 border-2 border-current border-t-transparent rounded-full"
						/>
						<span className="text-sm">Loading chart data...</span>
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return <ErrorAlert errorMessage={error.message} />;
	}

	if (!data || data.length === 0) {
		return (
			<div className="flex items-center justify-center h-[320px] bg-muted/30 border border-dashed border-border">
				<div className="text-center space-y-2">
					<p className="text-muted-foreground">No usage data available</p>
					<p className="text-xs text-muted-foreground/60">
						Deploy some bots to see your usage analytics
					</p>
				</div>
			</div>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.4 }}
			data-testid="chart-container"
			className="h-[320px] w-full"
		>
			<ResponsiveContainer width="100%" height="100%">
				<AreaChart
					data={data}
					margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
				>
					<defs>
						<linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="0%"
								stopColor="hsl(var(--accent))"
								stopOpacity={0.3}
							/>
							<stop
								offset="100%"
								stopColor="hsl(var(--accent))"
								stopOpacity={0}
							/>
						</linearGradient>
					</defs>

					<CartesianGrid
						strokeDasharray="3 3"
						stroke="hsl(var(--border))"
						vertical={false}
					/>

					<XAxis
						dataKey="date"
						tickFormatter={dateTickFormatter}
						axisLine={false}
						tickLine={false}
						tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
						dy={10}
					/>

					<YAxis
						domain={ydomain}
						allowDecimals={false}
						tickFormatter={
							metric === "msEllapsed"
								? (value) => `${(value / 60000).toFixed(0)}m`
								: undefined
						}
						axisLine={false}
						tickLine={false}
						tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
						dx={-10}
						width={40}
					/>

					<Tooltip
						content={<UsageTooltip metric={metric} />}
						cursor={{
							stroke: "hsl(var(--accent))",
							strokeWidth: 1,
							strokeDasharray: "4 4",
						}}
					/>

					<Area
						type="monotone"
						dataKey={metric}
						stroke="hsl(var(--accent))"
						strokeWidth={2}
						fill="url(#chartGradient)"
						dot={false}
						activeDot={{
							r: 5,
							fill: "hsl(var(--accent))",
							stroke: "hsl(var(--background))",
							strokeWidth: 2,
						}}
						animationDuration={600}
						animationEasing="ease-out"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</motion.div>
	);
}

export function UsageChart() {
	const [metric, setMetric] = useState<Metric>("botsUsed");
	const [timeframe, setTimeframe] = useState<Timeframe>("week");
	const [userTimezone, setUserTimezone] = useState<string>("");

	useEffect(() => {
		setUserTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
	}, []);

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

	function getTimeframeData() {
		if (timeframe === "daily") return dailyData;

		if (timeframe === "week") return weekData;

		return monthData;
	}

	const { data, isLoading, error } = getTimeframeData();

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

	const ydomain: [number, number] | undefined = data
		? [0, Math.max(max ?? 0, 1)]
		: undefined;

	const dateTickFormatter = (date: string) => {
		let parsedDate: Date;

		if (date.includes("T")) {
			parsedDate = new Date(date);
		} else {
			const [year, month, day] = date.split("-").map(Number);
			parsedDate = new Date(year, month - 1, day);
		}

		if (timeframe === "daily") {
			return parsedDate.toLocaleString("default", {
				hour: "numeric",
				hour12: true,
				timeZone: userTimezone,
			});
		}

		if (timeframe === "week") {
			return parsedDate.toLocaleString("default", {
				weekday: "short",
				timeZone: userTimezone,
			});
		}

		return parsedDate.toLocaleDateString("default", {
			month: "short",
			day: "numeric",
			timeZone: userTimezone,
		});
	};

	const timeframeOptions: { value: Timeframe; label: string }[] = [
		{ value: "month", label: "Month" },
		{ value: "week", label: "Week" },
		{ value: "daily", label: "Today" },
	];

	const metricOptions: { value: Metric; label: string }[] = [
		{ value: "botsUsed", label: "Bots Used" },
		{ value: "msEllapsed", label: "Active Time" },
	];

	return (
		<motion.div
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, delay: 0.1 }}
			className="bg-card border border-border"
		>
			{/* Header */}
			<div className="flex flex-col gap-4 p-5 border-b border-border sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<h3 className="font-semibold">Historical Usage</h3>
					{userTimezone ? (
						<p className="text-xs text-muted-foreground">
							{userTimezone.replace("_", " ")}
						</p>
					) : null}
				</div>

				<div className="flex flex-wrap items-center gap-3">
					<SegmentedControl
						options={timeframeOptions}
						value={timeframe}
						onChange={setTimeframe}
					/>
					<div className="h-4 w-px bg-border hidden sm:block" />
					<SegmentedControl
						options={metricOptions}
						value={metric}
						onChange={setMetric}
					/>
				</div>
			</div>

			{/* Chart Area */}
			<div className="p-5">
				<ChartContent
					data={data}
					isLoading={isLoading}
					error={error}
					ydomain={ydomain}
					metric={metric}
					dateTickFormatter={dateTickFormatter}
				/>
			</div>
		</motion.div>
	);
}
