import { Cloud, Container, Hexagon, Server } from "lucide-react";
import { unstable_noStore as noStore } from "next/cache";

import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { env } from "@/env";
import { api, HydrateClient } from "@/trpc/server";
import { parsePlatformPriority } from "@/utils/platform";

import { CostSummary } from "./_components/cost-summary";
import { DeploymentQueueSection } from "./_components/deployment-queue-table";
import { InfrastructureHeaderActions } from "./_components/infrastructure-header-actions";
import {
	InfrastructureStats,
	type Platform,
} from "./_components/infrastructure-stats";
import { InfrastructureTable } from "./_components/infrastructure-table";
import { PlatformSectionHeader } from "./_components/platform-section-header";
import { searchParamsCache } from "./search-params";

// ─── Platform Configuration ───────────────────────────────────────────────────

const PLATFORM_NAMES: Record<Platform, string> = {
	k8s: "Kubernetes",
	aws: "AWS ECS",
	coolify: "Coolify",
	local: "Local",
};

const PLATFORM_DESCRIPTIONS: Record<Platform, string> = {
	k8s: "Monitor Kubernetes Jobs and bot deployments",
	aws: "Monitor AWS ECS tasks and bot deployments",
	coolify: "Monitor bot pool capacity and deployment queue",
	local: "Local development mode",
};

function PlatformIcon({
	platform,
	className,
}: {
	platform: Platform;
	className?: string;
}) {
	const icons: Record<Platform, typeof Server> = {
		k8s: Container,
		aws: Cloud,
		coolify: Hexagon,
		local: Server,
	};

	const Icon = icons[platform];

	return <Icon className={className} />;
}

/**
 * Get enabled platforms from PLATFORM_PRIORITY env var
 * Filters out 'local' as it's only for development
 */
function getEnabledPlatforms(): Platform[] {
	const priority = parsePlatformPriority(env.PLATFORM_PRIORITY);
	const platforms: Platform[] = [];

	for (const p of priority) {
		if (p !== "local" && (p === "k8s" || p === "aws" || p === "coolify")) {
			platforms.push(p);
		}
	}

	return platforms.length > 0 ? platforms : ["local"];
}

// ─── Server Component ─────────────────────────────────────────────────────────

export default async function InfrastructurePage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[]>>;
}) {
	// Opt out of static rendering to read env at runtime
	noStore();

	const enabledPlatforms = getEnabledPlatforms();
	const primaryPlatform = enabledPlatforms[0] ?? "local";

	// Parse search params for filtering and sorting
	const { status, sort } = searchParamsCache.parse(await searchParams);

	// Prefetch stats for all enabled platforms
	for (const platform of enabledPlatforms) {
		if (platform === "coolify") {
			void api.infrastructure.coolify.getStats.prefetch();

			void api.infrastructure.coolify.getSlots.prefetch({
				status:
					status.length > 0
						? (status as Array<"IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR">)
						: undefined,
				sort,
			});
		} else if (platform === "k8s") {
			void api.infrastructure.k8s.getStats.prefetch();

			void api.infrastructure.k8s.getJobs.prefetch({
				status:
					status.length > 0
						? (status as Array<"PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED">)
						: undefined,
				sort,
			});
		} else if (platform === "aws") {
			void api.infrastructure.aws.getStats.prefetch();

			void api.infrastructure.aws.getTasks.prefetch({
				status:
					status.length > 0
						? (status as Array<
								"PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED"
							>)
						: undefined,
				sort,
			});
		}
	}

	// Prefetch hybrid infrastructure data
	void api.infrastructure.getActivePlatforms.prefetch();
	void api.infrastructure.getQueueStats.prefetch();
	void api.infrastructure.getQueuedBots.prefetch();
	void api.infrastructure.getCostStats.prefetch();

	const isMultiPlatform = enabledPlatforms.length > 1;

	return (
		<HydrateClient>
			<div className="mx-auto container space-y-6 px-4">
				<PageHeader>
					<PageHeaderContent>
						<div className="flex items-center gap-2">
							<PageHeaderTitle className="mb-2">Infrastructure</PageHeaderTitle>
							{!isMultiPlatform ? (
								<>
									<PlatformIcon
										platform={primaryPlatform}
										className="h-5 w-5"
									/>
									<span className="text-sm text-muted-foreground">
										{PLATFORM_NAMES[primaryPlatform]}
									</span>
								</>
							) : (
								<span className="text-sm text-muted-foreground">
									Hybrid ({enabledPlatforms.length} platforms)
								</span>
							)}
						</div>
						<PageHeaderDescription>
							{isMultiPlatform
								? "Monitor bot deployments across multiple platforms"
								: PLATFORM_DESCRIPTIONS[primaryPlatform]}
						</PageHeaderDescription>
					</PageHeaderContent>

					<PageHeaderActions>
						<InfrastructureHeaderActions />
					</PageHeaderActions>
				</PageHeader>

				{/* Cost Overview */}
				<CostSummary />

				{/* Platform stats - stacked for multi-platform */}
				{enabledPlatforms.map((platform) => (
					<div key={platform} className="space-y-2">
						{isMultiPlatform ? (
							<PlatformSectionHeader platform={platform} />
						) : null}
						<InfrastructureStats platform={platform} />
					</div>
				))}

				{/* Platform tables - stacked for multi-platform */}
				{enabledPlatforms.map((platform) =>
					platform !== "local" ? (
						<div key={`table-${platform}`} className="space-y-2">
							{isMultiPlatform ? (
								<PlatformSectionHeader platform={platform} suffix="Resources" />
							) : null}
							<InfrastructureTable platform={platform} />
						</div>
					) : null,
				)}

				{/* Global deployment queue */}
				<DeploymentQueueSection />
			</div>
		</HydrateClient>
	);
}
