"use client";

import { Download, Pause, Play, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

interface LogEntry {
	id: string;
	botId: number;
	timestamp: Date;
	level: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";
	message: string;
	state?: string;
	location?: string;
	context?: Record<string, unknown>;
	elapsed?: string;
}

interface LogsTabProps {
	botId: number;
	botStatus?: string;
}

const LEVEL_COLORS: Record<string, string> = {
	TRACE: "text-zinc-300",
	DEBUG: "text-blue-300",
	INFO: "text-green-300",
	WARN: "text-yellow-300",
	ERROR: "text-red-300",
	FATAL: "text-red-200 font-bold",
};

const LEVEL_BG_COLORS: Record<string, string> = {
	TRACE: "bg-zinc-800/50",
	DEBUG: "bg-blue-900/40",
	INFO: "bg-green-900/40",
	WARN: "bg-yellow-900/40",
	ERROR: "bg-red-900/40",
	FATAL: "bg-red-800/60",
};

interface TerminalContentProps {
	isLoading: boolean;
	filteredLogs: LogEntry[];
	totalLogs: number;
	showTimestamps: boolean;
	formatTimestamp: (date: Date) => string;
}

function TerminalContent({
	isLoading,
	filteredLogs,
	totalLogs,
	showTimestamps,
	formatTimestamp,
}: TerminalContentProps) {
	if (isLoading && totalLogs === 0) {
		return (
			<div className="flex items-center justify-center h-full text-zinc-500">
				Loading logs...
			</div>
		);
	}

	if (filteredLogs.length === 0) {
		return (
			<div className="flex items-center justify-center h-full text-zinc-500">
				{totalLogs === 0 ? "No logs yet" : "No logs match your filters"}
			</div>
		);
	}

	return (
		<div className="p-2 space-y-0.5 min-w-max">
			{filteredLogs.map((log) => (
				<div
					key={log.id}
					className={cn(
						"flex gap-2 px-2 py-0.5 rounded whitespace-nowrap",
						LEVEL_BG_COLORS[log.level] ?? "",
					)}
				>
					{showTimestamps ? (
						<span className="text-zinc-400 shrink-0">
							{formatTimestamp(log.timestamp)}
						</span>
					) : null}
					<span
						className={cn(
							"shrink-0 w-12 uppercase font-medium",
							LEVEL_COLORS[log.level] ?? "",
						)}
					>
						{log.level}
					</span>
					{log.state ? (
						<Badge
							variant="outline"
							className="shrink-0 h-4 text-[10px] bg-zinc-700/50 border-zinc-600 text-zinc-300"
						>
							{log.state}
						</Badge>
					) : null}
					<span className="text-zinc-100 whitespace-nowrap">{log.message}</span>
					{log.location ? (
						<span className="text-zinc-500 shrink-0 ml-auto text-[11px]">
							{log.location}
						</span>
					) : null}
				</div>
			))}
		</div>
	);
}

export function LogsTab({ botId, botStatus }: LogsTabProps) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [searchQuery, setSearchQuery] = useState("");
	const [levelFilter, setLevelFilter] = useState<string>("all");
	const [isPaused, setIsPaused] = useState(false);
	const [autoScroll, setAutoScroll] = useState(true);
	const [showTimestamps, setShowTimestamps] = useState(true);
	const terminalRef = useRef<HTMLDivElement>(null);
	const lastLogIdRef = useRef<string | undefined>();

	const isActive = Boolean(botStatus && !["DONE", "FATAL"].includes(botStatus));

	// Fetch live logs with polling
	const { data: liveData, isLoading } = api.bots.logs.getLive.useQuery(
		{
			botId: String(botId),
			afterId: lastLogIdRef.current,
			limit: 500,
		},
		{
			enabled: !isPaused && isActive,
			refetchInterval: isPaused ? false : 2000,
			refetchOnWindowFocus: false,
		},
	);

	// Fetch historical logs for finished bots
	const { data: historicalData, isLoading: historicalLoading } =
		api.bots.logs.getHistorical.useQuery(
			{
				botId: String(botId),
				limit: 500,
			},
			{
				enabled: !isActive,
			},
		);

	// Update logs when new data arrives
	useEffect(() => {
		if (liveData?.entries && liveData.entries.length > 0) {
			setLogs((prev) => {
				const newLogs = [...prev, ...liveData.entries];

				// Keep only the last 2000 logs
				return newLogs.slice(-2000);
			});

			// Update cursor for next fetch
			const lastEntry = liveData.entries[liveData.entries.length - 1];

			if (lastEntry) {
				lastLogIdRef.current = lastEntry.id;
			}
		}
	}, [liveData]);

	// Load historical logs for finished bots
	useEffect(() => {
		if (historicalData?.entries) {
			setLogs(historicalData.entries);
		}
	}, [historicalData]);

	// Handle scroll to detect manual scrolling
	const handleScroll = useCallback(() => {
		if (!terminalRef.current) return;

		const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

		setAutoScroll(isAtBottom);
	}, []);

	// Filter logs based on search and level
	const filteredLogs = logs.filter((log) => {
		const matchesSearch =
			searchQuery === "" ||
			log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
			log.state?.toLowerCase().includes(searchQuery.toLowerCase()) ||
			log.location?.toLowerCase().includes(searchQuery.toLowerCase());

		const matchesLevel = levelFilter === "all" || log.level === levelFilter;

		return matchesSearch && matchesLevel;
	});

	// Auto-scroll to bottom when filtered logs change
	const logCount = filteredLogs.length;

	useEffect(() => {
		if (autoScroll && terminalRef.current && logCount > 0) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
		}
	}, [logCount, autoScroll]);

	// Download logs as file
	const handleDownload = () => {
		const content = filteredLogs
			.map((log) => {
				const ts = new Date(log.timestamp).toISOString();
				const ctx = log.context ? ` ${JSON.stringify(log.context)}` : "";

				return `[${ts}] ${log.level.padEnd(5)} [${log.state ?? ""}] ${log.message}${ctx}`;
			})
			.join("\n");

		const blob = new Blob([content], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");

		a.href = url;
		a.download = `bot-${botId}-logs-${Date.now()}.log`;
		a.click();
		URL.revokeObjectURL(url);
	};

	// Format timestamp for display
	const formatTimestamp = (date: Date) => {
		return new Date(date).toLocaleTimeString("en-US", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
	};

	return (
		<div className="flex flex-col h-[500px]">
			{/* Toolbar */}
			<div className="flex items-center gap-2 p-3 border-b bg-muted/30">
				<div className="relative flex-1 max-w-sm">
					<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search logs..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-8 h-8"
					/>
				</div>

				<Select value={levelFilter} onValueChange={setLevelFilter}>
					<SelectTrigger className="w-[120px] h-8 text-foreground">
						<SelectValue placeholder="Level" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Levels</SelectItem>
						<SelectItem value="TRACE">Trace</SelectItem>
						<SelectItem value="DEBUG">Debug</SelectItem>
						<SelectItem value="INFO">Info</SelectItem>
						<SelectItem value="WARN">Warn</SelectItem>
						<SelectItem value="ERROR">Error</SelectItem>
						<SelectItem value="FATAL">Fatal</SelectItem>
					</SelectContent>
				</Select>

				<div className="flex items-center gap-1 ml-auto">
					{isActive ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setIsPaused(!isPaused)}
							className="h-8 px-2 text-foreground"
						>
							{isPaused ? (
								<>
									<Play className="h-4 w-4 mr-1" />
									Resume
								</>
							) : (
								<>
									<Pause className="h-4 w-4 mr-1" />
									Pause
								</>
							)}
						</Button>
					) : null}

					<Button
						variant="ghost"
						size="sm"
						onClick={() => setShowTimestamps(!showTimestamps)}
						className={cn(
							"h-8 px-2 text-foreground",
							showTimestamps && "bg-muted",
						)}
					>
						Timestamps
					</Button>

					<Button
						variant="ghost"
						size="sm"
						onClick={handleDownload}
						className="h-8 px-2"
						disabled={filteredLogs.length === 0}
					>
						<Download className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* Terminal */}
			<div
				ref={terminalRef}
				onScroll={handleScroll}
				className="flex-1 overflow-auto bg-zinc-950 font-mono text-xs"
			>
				<TerminalContent
					isLoading={isLoading || historicalLoading}
					filteredLogs={filteredLogs}
					totalLogs={logs.length}
					showTimestamps={showTimestamps}
					formatTimestamp={formatTimestamp}
				/>
			</div>

			{/* Status bar */}
			<div className="flex items-center gap-3 px-3 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground">
				<span>
					{isActive ? (
						<span className="flex items-center gap-1">
							<span
								className={cn(
									"h-2 w-2 rounded-full",
									isPaused ? "bg-yellow-500" : "bg-green-500 animate-pulse",
								)}
							/>
							{isPaused ? "Paused" : "Live"}
						</span>
					) : (
						"Historical"
					)}
				</span>

				<span>
					{filteredLogs.length.toLocaleString()} entries
					{logs.length !== filteredLogs.length ? ` (${logs.length} total)` : ""}
				</span>

				{!autoScroll && logs.length > 0 ? (
					<Button
						variant="link"
						size="sm"
						className="h-auto p-0 text-xs"
						onClick={() => {
							setAutoScroll(true);

							if (terminalRef.current) {
								terminalRef.current.scrollTop =
									terminalRef.current.scrollHeight;
							}
						}}
					>
						Scroll to bottom
					</Button>
				) : null}
			</div>
		</div>
	);
}
