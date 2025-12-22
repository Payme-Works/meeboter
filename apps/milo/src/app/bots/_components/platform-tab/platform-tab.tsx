"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	Box,
	CheckCircle,
	Clock,
	Container,
	HardDrive,
	Loader2,
	RefreshCw,
	Server,
	XCircle,
} from "lucide-react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

type DeploymentPlatform = "k8s" | "coolify" | "aws" | "local" | null;

interface PlatformTabProps {
	deploymentPlatform: DeploymentPlatform;
	platformIdentifier: string | null;
	botStatus?: string;
}

const ACTIVE_STATUSES = [
	"DEPLOYING",
	"JOINING_CALL",
	"IN_WAITING_ROOM",
	"IN_CALL",
	"LEAVING",
];

export function PlatformTab({
	deploymentPlatform,
	platformIdentifier,
	botStatus,
}: PlatformTabProps) {
	const isActive = botStatus ? ACTIVE_STATUSES.includes(botStatus) : false;

	if (!deploymentPlatform) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<Server className="h-12 w-12 mb-4 opacity-50" />
				<p className="text-sm">Platform information not available</p>
				<p className="text-xs mt-1">
					This bot was created before platform tracking was enabled
				</p>
			</div>
		);
	}

	switch (deploymentPlatform) {
		case "k8s":
			return (
				<K8sPlatformView
					platformIdentifier={platformIdentifier}
					isActive={isActive}
				/>
			);
		case "coolify":
			return (
				<CoolifyPlatformView
					platformIdentifier={platformIdentifier}
					isActive={isActive}
				/>
			);
		case "aws":
			return (
				<AwsPlatformView
					platformIdentifier={platformIdentifier}
					isActive={isActive}
				/>
			);
		case "local":
			return <LocalPlatformView />;
		default:
			return (
				<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
					<AlertCircle className="h-12 w-12 mb-4 opacity-50" />
					<p className="text-sm">Unknown platform: {deploymentPlatform}</p>
				</div>
			);
	}
}

interface PlatformHeaderProps {
	platform: string;
	icon?: string;
	isActive: boolean;
}

function PlatformHeader({ platform, icon, isActive }: PlatformHeaderProps) {
	return (
		<div className="flex items-center justify-between mb-6">
			<div className="flex items-center gap-3">
				{icon ? (
					<div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center">
						<Image src={icon} alt={platform} width={24} height={24} />
					</div>
				) : (
					<div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center">
						<Server className="h-5 w-5 text-muted-foreground" />
					</div>
				)}
				<div>
					<h3 className="font-semibold">{platform}</h3>
					<p className="text-xs text-muted-foreground">Deployment Platform</p>
				</div>
			</div>
			<Badge
				variant="outline"
				className={cn(
					"text-xs",
					isActive
						? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
						: "bg-muted text-muted-foreground",
				)}
			>
				{isActive ? (
					<>
						<span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
						Active
					</>
				) : (
					"Inactive"
				)}
			</Badge>
		</div>
	);
}

interface K8sPlatformViewProps {
	platformIdentifier: string | null;
	isActive: boolean;
}

function K8sPlatformView({
	platformIdentifier,
	isActive,
}: K8sPlatformViewProps) {
	const {
		data: jobData,
		isLoading,
		isRefetching,
		refetch,
	} = api.bots.k8s.getJob.useQuery(
		{ jobName: platformIdentifier ?? "" },
		{
			enabled: !!platformIdentifier,
			refetchInterval: isActive ? 10000 : false,
		},
	);

	if (!platformIdentifier) {
		return (
			<div className="p-6">
				<PlatformHeader
					platform="Kubernetes"
					icon="/platform-logos/kubernetes.svg"
					isActive={isActive}
				/>
				<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
					<AlertCircle className="h-8 w-8 mb-2 opacity-50" />
					<p className="text-sm">No job identifier available</p>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="p-6 space-y-4">
				<PlatformHeader
					platform="Kubernetes"
					icon="/platform-logos/kubernetes.svg"
					isActive={isActive}
				/>
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-32 w-full" />
			</div>
		);
	}

	if (!jobData) {
		return (
			<div className="p-6">
				<PlatformHeader
					platform="Kubernetes"
					icon="/platform-logos/kubernetes.svg"
					isActive={isActive}
				/>
				<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
					<XCircle className="h-8 w-8 mb-2 opacity-50" />
					<p className="text-sm">Job not found: {platformIdentifier}</p>
					<p className="text-xs mt-1">The job may have been cleaned up</p>
				</div>
			</div>
		);
	}

	const job = jobData.job as {
		status?: { active?: number; succeeded?: number; failed?: number };
		metadata?: { creationTimestamp?: string; name?: string };
	};

	const pods = jobData.pods as Array<{
		metadata?: { name?: string };
		status?: {
			phase?: string;
			containerStatuses?: Array<{
				state?: { running?: unknown; waiting?: unknown; terminated?: unknown };
				restartCount?: number;
			}>;
		};
		spec?: { nodeName?: string };
	}>;

	const events = jobData.events as Array<{
		type?: string;
		reason?: string;
		message?: string;
		lastTimestamp?: string;
	}>;

	const getJobStatus = () => {
		if ((job.status?.active ?? 0) > 0) return "Running";

		if ((job.status?.succeeded ?? 0) > 0) return "Succeeded";

		if ((job.status?.failed ?? 0) > 0) return "Failed";

		return "Pending";
	};

	const jobStatus = getJobStatus();

	const pod = pods[0];
	const podPhase = pod?.status?.phase ?? "Unknown";
	const containerStatus = pod?.status?.containerStatuses?.[0];

	const getContainerState = () => {
		if (containerStatus?.state?.running) return "Running";

		if (containerStatus?.state?.waiting) return "Waiting";

		if (containerStatus?.state?.terminated) return "Terminated";

		return "Unknown";
	};

	const containerState = getContainerState();

	const restarts = containerStatus?.restartCount ?? 0;

	return (
		<div className="p-6 space-y-4">
			<div className="flex items-center justify-between">
				<PlatformHeader
					platform="Kubernetes"
					icon="/platform-logos/kubernetes.svg"
					isActive={isActive}
				/>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => refetch()}
					disabled={isRefetching}
				>
					<RefreshCw
						className={cn("h-4 w-4", isRefetching && "animate-spin")}
					/>
				</Button>
			</div>

			<div className="grid grid-cols-2 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm flex items-center gap-2">
							<Box className="h-4 w-4" />
							Job
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Name</span>
							<span className="font-mono text-xs truncate max-w-[180px]">
								{job.metadata?.name ?? platformIdentifier}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Status</span>
							<JobStatusBadge status={jobStatus} />
						</div>
						{job.metadata?.creationTimestamp ? (
							<div className="flex justify-between">
								<span className="text-muted-foreground">Created</span>
								<span className="tabular-nums">
									{formatDistanceToNow(
										new Date(job.metadata.creationTimestamp),
										{
											addSuffix: true,
										},
									)}
								</span>
							</div>
						) : null}
					</CardContent>
				</Card>

				{pod ? (
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-sm flex items-center gap-2">
								<Container className="h-4 w-4" />
								Pod
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Name</span>
								<span className="font-mono text-xs truncate max-w-[180px]">
									{pod.metadata?.name ?? "—"}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Phase</span>
								<PodPhaseBadge phase={podPhase} />
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Container</span>
								<span>{containerState}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Restarts</span>
								<span
									className={cn(
										"tabular-nums",
										restarts > 0 && "text-amber-600",
									)}
								>
									{restarts}
								</span>
							</div>
							{pod.spec?.nodeName ? (
								<div className="flex justify-between">
									<span className="text-muted-foreground">Node</span>
									<span className="font-mono text-xs">{pod.spec.nodeName}</span>
								</div>
							) : null}
						</CardContent>
					</Card>
				) : null}
			</div>

			{events.length > 0 ? (
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm">Recent Events</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 max-h-48 overflow-y-auto">
							{events.slice(0, 10).map((event, i) => (
								<div
									key={i}
									className="flex items-start gap-2 text-xs py-1.5 border-b border-dashed border-border/50 last:border-0"
								>
									{event.type === "Warning" ? (
										<AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
									) : (
										<CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
									)}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium">{event.reason}</span>
											{event.lastTimestamp ? (
												<span className="text-muted-foreground tabular-nums">
													{format(new Date(event.lastTimestamp), "HH:mm:ss")}
												</span>
											) : null}
										</div>
										<p className="text-muted-foreground truncate">
											{event.message}
										</p>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}

function JobStatusBadge({ status }: { status: string }) {
	const config: Record<
		string,
		{ bg: string; text: string; icon: React.ReactNode }
	> = {
		Running: {
			bg: "bg-blue-50 dark:bg-blue-950",
			text: "text-blue-700 dark:text-blue-400",
			icon: <Loader2 className="h-3 w-3 animate-spin" />,
		},
		Succeeded: {
			bg: "bg-green-50 dark:bg-green-950",
			text: "text-green-700 dark:text-green-400",
			icon: <CheckCircle className="h-3 w-3" />,
		},
		Failed: {
			bg: "bg-red-50 dark:bg-red-950",
			text: "text-red-700 dark:text-red-400",
			icon: <XCircle className="h-3 w-3" />,
		},
		Pending: {
			bg: "bg-amber-50 dark:bg-amber-950",
			text: "text-amber-700 dark:text-amber-400",
			icon: <Clock className="h-3 w-3" />,
		},
	};

	const c = config[status] ?? config.Pending;

	return (
		<Badge variant="outline" className={cn(c.bg, c.text, "border-transparent")}>
			{c.icon}
			<span className="ml-1">{status}</span>
		</Badge>
	);
}

function PodPhaseBadge({ phase }: { phase: string }) {
	const config: Record<string, { bg: string; text: string }> = {
		Running: {
			bg: "bg-green-50 dark:bg-green-950",
			text: "text-green-700 dark:text-green-400",
		},
		Pending: {
			bg: "bg-amber-50 dark:bg-amber-950",
			text: "text-amber-700 dark:text-amber-400",
		},
		Succeeded: {
			bg: "bg-blue-50 dark:bg-blue-950",
			text: "text-blue-700 dark:text-blue-400",
		},
		Failed: {
			bg: "bg-red-50 dark:bg-red-950",
			text: "text-red-700 dark:text-red-400",
		},
		Unknown: {
			bg: "bg-muted",
			text: "text-muted-foreground",
		},
	};

	const c = config[phase] ?? config.Unknown;

	return (
		<Badge variant="outline" className={cn(c.bg, c.text, "border-transparent")}>
			{phase}
		</Badge>
	);
}

interface CoolifyPlatformViewProps {
	platformIdentifier: string | null;
	isActive: boolean;
}

function CoolifyPlatformView({
	platformIdentifier,
	isActive,
}: CoolifyPlatformViewProps) {
	return (
		<div className="p-6 space-y-4">
			<PlatformHeader
				platform="Coolify"
				icon="/platform-logos/coolify.svg"
				isActive={isActive}
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm flex items-center gap-2">
						<Server className="h-4 w-4" />
						Pool Slot
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Application UUID</span>
						<span className="font-mono text-xs truncate max-w-[200px]">
							{platformIdentifier ?? "Not assigned"}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Status</span>
						<Badge
							variant="outline"
							className={cn(
								isActive
									? "bg-green-50 text-green-700 border-transparent dark:bg-green-950 dark:text-green-400"
									: "bg-muted text-muted-foreground border-transparent",
							)}
						>
							{isActive ? "In Use" : "Released"}
						</Badge>
					</div>
				</CardContent>
			</Card>

			<div className="text-xs text-muted-foreground text-center py-4">
				Coolify manages bot containers through a pool of pre-warmed slots for
				fast deployment.
			</div>
		</div>
	);
}

interface AwsPlatformViewProps {
	platformIdentifier: string | null;
	isActive: boolean;
}

function AwsPlatformView({
	platformIdentifier,
	isActive,
}: AwsPlatformViewProps) {
	// Parse task ARN to extract useful info
	// Format: arn:aws:ecs:region:account:task/cluster/task-id
	const taskArn = platformIdentifier ?? "";
	const arnParts = taskArn.split(":");
	const region = arnParts[3] ?? "—";
	const taskPath = arnParts[5]?.split("/") ?? [];
	const cluster = taskPath[1] ?? "—";
	const taskId = taskPath[2] ?? platformIdentifier ?? "—";

	return (
		<div className="p-6 space-y-4">
			<PlatformHeader
				platform="AWS ECS"
				icon="/platform-logos/aws.svg"
				isActive={isActive}
			/>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm flex items-center gap-2">
						<Container className="h-4 w-4" />
						ECS Task
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex justify-between">
						<span className="text-muted-foreground">Task ID</span>
						<span className="font-mono text-xs truncate max-w-[200px]">
							{taskId}
						</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Cluster</span>
						<span className="font-mono text-xs">{cluster}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Region</span>
						<span className="font-mono text-xs">{region}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-muted-foreground">Status</span>
						<Badge
							variant="outline"
							className={cn(
								isActive
									? "bg-green-50 text-green-700 border-transparent dark:bg-green-950 dark:text-green-400"
									: "bg-muted text-muted-foreground border-transparent",
							)}
						>
							{isActive ? "RUNNING" : "STOPPED"}
						</Badge>
					</div>
				</CardContent>
			</Card>

			{platformIdentifier ? (
				<div className="text-xs text-muted-foreground">
					<p className="font-mono break-all">{platformIdentifier}</p>
				</div>
			) : null}
		</div>
	);
}

function LocalPlatformView() {
	return (
		<div className="p-6 space-y-4">
			<PlatformHeader platform="Local Development" isActive={false} />

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm flex items-center gap-2">
						<HardDrive className="h-4 w-4" />
						Local Process
					</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					<p>
						This bot is running locally for development purposes. No container
						or cloud infrastructure is being used.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
