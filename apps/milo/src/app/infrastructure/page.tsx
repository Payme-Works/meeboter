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

import { InfrastructureHeaderActions } from "./_components/infrastructure-header-actions";
import {
	InfrastructureStats,
	type Platform,
} from "./_components/infrastructure-stats";
import { InfrastructureTable } from "./_components/infrastructure-table";

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

// ─── Server Component ─────────────────────────────────────────────────────────

export default function InfrastructurePage() {
	// Opt out of static rendering to read env at runtime
	noStore();

	const platform = env.DEPLOYMENT_PLATFORM;

	return (
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<div className="flex items-center gap-2">
						<PageHeaderTitle className="mb-2">Infrastructure</PageHeaderTitle>
						<PlatformIcon platform={platform} className="h-5 w-5" />
						<span className="text-sm text-muted-foreground">
							{PLATFORM_NAMES[platform]}
						</span>
					</div>
					<PageHeaderDescription>
						{PLATFORM_DESCRIPTIONS[platform]}
					</PageHeaderDescription>
				</PageHeaderContent>
				<PageHeaderActions>
					<InfrastructureHeaderActions />
				</PageHeaderActions>
			</PageHeader>

			<InfrastructureStats platform={platform} />

			{platform !== "local" ? (
				<InfrastructureTable platform={platform} />
			) : null}
		</div>
	);
}
