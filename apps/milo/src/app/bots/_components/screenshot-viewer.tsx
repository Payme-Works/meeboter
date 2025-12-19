"use client";

import { format, formatDistanceToNow } from "date-fns";
import {
	AlertCircle,
	Camera,
	ChevronLeft,
	ChevronRight,
	ImageIcon,
	RefreshCw,
	X,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ScreenshotData } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface ScreenshotViewerProps {
	screenshots: ScreenshotData[];
	isLoading?: boolean;
}

const TYPE_CONFIG: Record<
	ScreenshotData["type"],
	{ label: string; color: string; bgColor: string; icon: typeof Camera }
> = {
	error: {
		label: "Error",
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
		icon: AlertCircle,
	},
	fatal: {
		label: "Fatal",
		color: "text-red-600 dark:text-red-400",
		bgColor: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
		icon: AlertCircle,
	},
	manual: {
		label: "Manual",
		color: "text-blue-600 dark:text-blue-400",
		bgColor: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
		icon: Camera,
	},
	state_change: {
		label: "State Change",
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
}: ScreenshotViewerProps) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex gap-3 overflow-hidden">
					{[...Array(4)].map((_, i) => (
						<Skeleton
							key={`skeleton-${i}`}
							className="h-24 w-36 rounded-lg flex-shrink-0"
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
			</div>
		);
	}

	const selectedScreenshot =
		selectedIndex !== null ? screenshots[selectedIndex] : null;

	const handlePrevious = () => {
		if (selectedIndex !== null && selectedIndex > 0) {
			setSelectedIndex(selectedIndex - 1);
		}
	};

	const handleNext = () => {
		if (selectedIndex !== null && selectedIndex < screenshots.length - 1) {
			setSelectedIndex(selectedIndex + 1);
		}
	};

	return (
		<>
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Screenshots ({screenshots.length})
					</h4>
				</div>

				<ScrollArea className="w-full whitespace-nowrap">
					<div className="flex gap-3 pb-3">
						{screenshots.map((screenshot, index) => {
							const config = TYPE_CONFIG[screenshot.type];
							const Icon = config.icon;

							return (
								<button
									key={`${screenshot.key}-${screenshot.capturedAt}`}
									type="button"
									onClick={() => setSelectedIndex(index)}
									className={cn(
										"relative flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all duration-150 hover:ring-2 hover:ring-primary/50 focus:outline-none focus:ring-2 focus:ring-primary",
										"w-36 h-24",
										config.bgColor,
									)}
								>
									{/* Thumbnail with presigned URL */}
									<ScreenshotImage
										s3Key={screenshot.key}
										alt={`Screenshot ${index + 1}`}
										fill
										className="object-cover"
										sizes="144px"
									/>

									{/* Overlay with metadata */}
									<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

									{/* Type badge */}
									<div className="absolute top-1.5 left-1.5">
										<div
											className={cn(
												"flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
												"bg-white/90 dark:bg-black/90",
												config.color,
											)}
										>
											<Icon className="h-2.5 w-2.5" />
											{config.label}
										</div>
									</div>

									{/* Time */}
									<div className="absolute bottom-1.5 left-1.5 right-1.5">
										<span className="text-[10px] text-white/90 font-medium truncate block">
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

			{/* Full-size viewer dialog */}
			<Dialog
				open={selectedIndex !== null}
				onOpenChange={() => setSelectedIndex(null)}
			>
				<DialogContent
					className="max-w-5xl p-0 gap-0 overflow-hidden"
					aria-describedby={undefined}
				>
					<DialogHeader className="px-4 py-3 border-b">
						<div className="flex items-center justify-between">
							<DialogTitle className="text-sm font-medium flex items-center gap-2">
								{selectedScreenshot ? (
									<>
										<Badge
											variant="outline"
											className={cn(
												"text-xs",
												TYPE_CONFIG[selectedScreenshot.type].bgColor,
												TYPE_CONFIG[selectedScreenshot.type].color,
											)}
										>
											{TYPE_CONFIG[selectedScreenshot.type].label}
										</Badge>
										<span className="text-muted-foreground">
											{selectedScreenshot.state}
										</span>
										{selectedScreenshot.trigger ? (
											<span className="text-xs text-muted-foreground/70 truncate max-w-[300px]">
												{selectedScreenshot.trigger}
											</span>
										) : null}
									</>
								) : null}
							</DialogTitle>
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground tabular-nums">
									{selectedIndex !== null ? selectedIndex + 1 : 0} /{" "}
									{screenshots.length}
								</span>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									onClick={() => setSelectedIndex(null)}
								>
									<X className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</DialogHeader>

					<div className="relative bg-muted/50">
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

						{/* Full-size image with presigned URL */}
						{selectedScreenshot ? (
							<div className="relative w-full aspect-video">
								<ScreenshotImage
									s3Key={selectedScreenshot.key}
									alt={`Screenshot ${(selectedIndex ?? 0) + 1}`}
									fill
									className="object-contain"
									sizes="(max-width: 1280px) 100vw, 1280px"
									priority
								/>
							</div>
						) : null}
					</div>

					{/* Footer with timestamp */}
					{selectedScreenshot ? (
						<div className="px-4 py-2 border-t text-xs text-muted-foreground">
							Captured {format(new Date(selectedScreenshot.capturedAt), "PPpp")}
						</div>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	);
}
