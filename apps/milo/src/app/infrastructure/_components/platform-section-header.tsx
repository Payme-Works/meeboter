"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { Cloud, Container, Hexagon, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { api } from "@/trpc/react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Platform = "k8s" | "aws" | "coolify" | "local";

const PLATFORM_NAMES: Record<Platform, string> = {
	k8s: "Kubernetes",
	aws: "AWS ECS",
	coolify: "Coolify",
	local: "Local",
};

// ─── Platform Icon ────────────────────────────────────────────────────────────

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

// ─── Platform Section Header ──────────────────────────────────────────────────

interface PlatformSectionHeaderProps {
	platform: Platform;
	suffix?: string;
}

export function PlatformSectionHeader({
	platform,
	suffix,
}: PlatformSectionHeaderProps) {
	const { data: capacityStats } =
		api.infrastructure.getActivePlatforms.useQuery(undefined, {
			refetchInterval: 5000,
			refetchOnWindowFocus: true,
			placeholderData: keepPreviousData,
		});

	const platformCapacity = capacityStats?.find((p) => p.platform === platform);

	const capacityLabel = platformCapacity
		? `${platformCapacity.used}/${platformCapacity.limit}`
		: null;

	return (
		<div className="flex items-center gap-2">
			<PlatformIcon platform={platform} className="h-4 w-4" />
			<span className="text-sm font-medium">
				{PLATFORM_NAMES[platform]}
				{suffix ? ` ${suffix}` : ""}
			</span>
			{capacityLabel ? (
				<Badge variant="secondary" className="text-xs">
					{capacityLabel}
				</Badge>
			) : null}
		</div>
	);
}
