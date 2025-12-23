"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	Camera,
	ChevronLeft,
	ChevronRight,
	ImageIcon,
	RefreshCw,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ScreenshotData } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface ScreenshotViewerProps {
	screenshots: ScreenshotData[];
	isLoading?: boolean;
	isRefetching?: boolean;
	onRefresh?: () => void;
}

const TYPE_CONFIG: Record<
	ScreenshotData["type"],
	{ color: string; bgColor: string; icon: typeof Camera }
> = {
	error: {
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
		icon: AlertCircle,
	},
	fatal: {
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
		icon: AlertCircle,
	},
	manual: {
		color: "text-blue-600 dark:text-blue-400",
		bgColor: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
		icon: Camera,
	},
	state_change: {
		color: "text-amber-600 dark:text-amber-400",
		bgColor:
			"bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
		icon: RefreshCw,
	},
};

/**
 * Component that fetches a presigned URL for a screenshot and renders it
 */
function ScreenshotImage({
	s3Key,
	alt,
	fill,
	className,
	sizes,
	priority,
}: {
	s3Key: string;
	alt: string;
	fill?: boolean;
	className?: string;
	sizes?: string;
	priority?: boolean;
}) {
	const { data, isLoading } = api.bots.getScreenshotSignedUrl.useQuery(
		{ key: s3Key },
		{ staleTime: 30 * 60 * 1000 }, // Cache for 30 minutes
	);

	if (isLoading || !data?.url) {
		return <Skeleton className={cn("bg-muted", className)} />;
	}

	return (
		<Image
			src={data.url}
			alt={alt}
			fill={fill}
			className={className}
			sizes={sizes}
			priority={priority}
			unoptimized
		/>
	);
}

export function ScreenshotViewer({
	screenshots,
	isLoading,
	isRefetching,
	onRefresh,
}: ScreenshotViewerProps) {
	// Select first screenshot by default
	const [selectedIndex, setSelectedIndex] = useState(0);
	const thumbnailRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

	// Auto-scroll to selected thumbnail
	useEffect(() => {
		const thumbnail = thumbnailRefs.current.get(selectedIndex);

		if (thumbnail) {
			thumbnail.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
				inline: "center",
			});
		}
	}, [selectedIndex]);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex gap-3 overflow-hidden">
					{[...Array(4)].map((_, i) => (
						<Skeleton
							key={`skeleton-${i}`}
							className="h-24 w-36 rounded-lg shrink-0"
						/>
					))}
				</div>
			</div>
		);
	}

	if (screenshots.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
				<ImageIcon className="h-12 w-12 mb-3 opacity-50" />
				<p className="text-sm font-medium">No screenshots captured</p>
				<p className="text-xs mt-1 opacity-70">
					Screenshots are captured automatically during errors
				</p>
				{onRefresh ? (
					<Button
						variant="ghost"
						size="sm"
						onClick={onRefresh}
						disabled={isRefetching}
						className="mt-3"
					>
						<RefreshCw
							className={cn("h-4 w-4 mr-2", isRefetching && "animate-spin")}
						/>
						Refresh
					</Button>
				) : null}
			</div>
		);
	}

	const selectedScreenshot = screenshots[selectedIndex];

	const handlePrevious = () => {
		if (selectedIndex > 0) {
			setSelectedIndex(selectedIndex - 1);
		}
	};

	const handleNext = () => {
		if (selectedIndex < screenshots.length - 1) {
			setSelectedIndex(selectedIndex + 1);
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Full-size viewer (above carousel) */}
			{selectedScreenshot ? (
				<div className="flex-1 min-h-0 flex flex-col">
					{/* Header with metadata */}
					<div className="flex items-center justify-between px-2 py-2">
						<div className="flex items-center gap-2">
							<Badge
								variant="outline"
								className={cn(
									"text-xs",
									TYPE_CONFIG[selectedScreenshot.type].bgColor,
									TYPE_CONFIG[selectedScreenshot.type].color,
								)}
							>
								{selectedScreenshot.type.toUpperCase()}
							</Badge>

							<span className="text-sm text-muted-foreground">
								{selectedScreenshot.state}
							</span>
							{selectedScreenshot.trigger ? (
								<span className="text-xs text-muted-foreground/70 truncate max-w-[300px]">
									{selectedScreenshot.trigger}
								</span>
							) : null}
						</div>

						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground tabular-nums">
								{selectedIndex + 1} / {screenshots.length}
							</span>
							{isRefetching ? (
								<RefreshCw className="h-3 w-3 text-muted-foreground animate-spin" />
							) : null}
							{onRefresh ? (
								<Button
									variant="ghost"
									size="sm"
									onClick={onRefresh}
									disabled={isRefetching}
									className="h-7 px-2 text-xs"
								>
									<RefreshCw
										className={cn(
											"h-3 w-3 mr-1",
											isRefetching && "animate-spin",
										)}
									/>
									Refresh
								</Button>
							) : null}
						</div>
					</div>

					{/* Image viewer with navigation */}
					<div className="relative flex-1 min-h-0 bg-muted/50">
						{/* Navigation buttons */}
						<Button
							variant="ghost"
							size="icon"
							className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 hover:bg-background z-10"
							onClick={handlePrevious}
							disabled={selectedIndex === 0}
						>
							<ChevronLeft className="h-5 w-5" />
						</Button>

						<Button
							variant="ghost"
							size="icon"
							className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 hover:bg-background z-10"
							onClick={handleNext}
							disabled={selectedIndex === screenshots.length - 1}
						>
							<ChevronRight className="h-5 w-5" />
						</Button>

						{/* Full-size image */}
						<div className="relative w-full h-full">
							<ScreenshotImage
								s3Key={selectedScreenshot.key}
								alt={`Screenshot ${selectedIndex + 1}`}
								fill
								className="object-contain"
								sizes="(max-width: 1280px) 100vw, 800px"
								priority
							/>
						</div>
					</div>

					{/* Footer with timestamp */}
					<div className="px-2 py-1.5 text-xs text-muted-foreground">
						Captured {format(new Date(selectedScreenshot.capturedAt), "PPpp")}
					</div>
				</div>
			) : null}

			{/* Horizontal thumbnail carousel */}
			<div className="pt-3 px-2">
				<ScrollArea className="w-full whitespace-nowrap">
					<div className="flex gap-2 pb-2">
						{screenshots.map((screenshot, index) => {
							const config = TYPE_CONFIG[screenshot.type];
							const Icon = config.icon;
							const isSelected = selectedIndex === index;

							return (
								<button
									key={`${screenshot.key}-${screenshot.capturedAt}`}
									ref={(el) => {
										if (el) {
											thumbnailRefs.current.set(index, el);
										} else {
											thumbnailRefs.current.delete(index);
										}
									}}
									type="button"
									onClick={() => setSelectedIndex(index)}
									className={cn(
										"relative shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-150 focus:outline-none",
										"w-28 h-20",
										isSelected ? "border-primary" : "border-transparent",
									)}
								>
									{/* Thumbnail with presigned URL */}
									<ScreenshotImage
										s3Key={screenshot.key}
										alt={`Screenshot ${index + 1}`}
										fill
										className="object-cover"
										sizes="112px"
									/>

									{/* Overlay with metadata */}
									<div className="absolute inset-0 bg-linear-to-t from-white/90 via-white/50 to-transparent" />

									{/* Type badge */}
									<div className="absolute top-1 left-1">
										<div
											className={cn(
												"flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium",
												"bg-white/90 dark:bg-black/90",
												config.color,
											)}
										>
											<Icon className="h-2 w-2" />
											{screenshot.type.toUpperCase()}
										</div>
									</div>

									{/* Time */}
									<div className="absolute bottom-1 left-1 right-1">
										<span className="text-[9px] text-black/80 font-medium truncate block">
											{formatDistanceToNow(new Date(screenshot.capturedAt), {
												addSuffix: true,
											})}
										</span>
									</div>
								</button>
							);
						})}
					</div>
					<ScrollBar orientation="horizontal" />
				</ScrollArea>
			</div>
		</div>
	);
}
