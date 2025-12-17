"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Bot, Loader2, Rocket, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { getRandomBrazilianNames } from "@/utils/random-names";

const quickBotSchema = z.object({
	meetingUrl: z.string().min(1, "Paste your meeting URL"),
	botCount: z.number().min(1).max(256),
});

type QuickBotFormData = z.infer<typeof quickBotSchema>;

function detectPlatform(
	url: string,
): "google" | "teams" | "zoom" | "unknown" | null {
	if (!url) return null;

	if (url.includes("meet.google.com")) return "google";

	if (url.includes("teams.microsoft.com") || url.includes("teams.live.com"))
		return "teams";

	if (url.includes("zoom.us")) return "zoom";

	return "unknown";
}

interface UsageStatsProps {
	usage: number;
	limit: number | null;
	remaining: number | null;
}

function UsageStatsSkeleton() {
	return (
		<div className="flex items-center gap-6">
			<div className="flex items-center gap-3">
				<Skeleton className="h-12 w-12" />
				<div>
					<Skeleton className="h-8 w-12 mb-1" />
					<Skeleton className="h-3 w-20" />
				</div>
			</div>
			<div className="h-8 w-px bg-border" />
			<div className="flex-1 max-w-48">
				<div className="flex items-center justify-between gap-4 mb-1">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-3 w-10" />
				</div>
				<Skeleton className="h-1.5 w-full" />
			</div>
		</div>
	);
}

function UsageStats({ usage, limit, remaining }: UsageStatsProps) {
	const isUnlimited = limit === null;

	const usagePercentage =
		limit && usage ? Math.min((usage / limit) * 100, 100) : 0;

	return (
		<div className="flex items-center gap-6">
			<div className="flex items-center gap-3">
				<div className="flex h-12 w-12 items-center justify-center bg-accent/10 text-accent">
					<Bot className="h-6 w-6" />
				</div>

				<div>
					<div className="text-2xl font-bold tabular-nums">
						{isUnlimited ? "∞" : remaining}
					</div>
					<div className="text-xs text-muted-foreground">bots remaining</div>
				</div>
			</div>

			<div className="h-8 w-px bg-border" />

			{!isUnlimited ? (
				<div className="flex-1 max-w-48">
					<div className="flex items-center justify-between gap-4 text-xs text-muted-foreground mb-1">
						<span>Today's usage</span>

						<span className="tabular-nums">
							{usage}/{limit}
						</span>
					</div>
					<Progress value={usagePercentage} className="h-1.5" />
				</div>
			) : (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Sparkles className="h-4 w-4 text-accent" />
					<span>Unlimited plan</span>
				</div>
			)}
		</div>
	);
}

export function QuickBotJoin() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	const form = useForm<QuickBotFormData>({
		resolver: zodResolver(quickBotSchema),
		defaultValues: {
			meetingUrl: "",
			botCount: 1,
		},
	});

	const createBotMutation = api.bots.createBot.useMutation();
	const utils = api.useUtils();

	const { data: dailyUsage, isLoading: isUsageLoading } =
		api.bots.getDailyUsage.useQuery({
			timeZone: userTimezone,
		});

	const botCount = form.watch("botCount") || 1;
	const meetingUrl = form.watch("meetingUrl");

	// Show skeleton until usage data is loaded
	if (isUsageLoading || !dailyUsage) {
		return <QuickBotJoinSkeleton />;
	}

	const remaining = dailyUsage.remaining ?? 0;
	const isUnlimited = dailyUsage.remaining === null;

	const willExceedQuota = !isUnlimited && remaining < botCount;

	const detectedPlatform = detectPlatform(meetingUrl);

	async function handleSubmit(data: QuickBotFormData) {
		if (!isUnlimited && remaining < data.botCount) {
			form.setError("botCount", {
				message: `Only ${remaining} bots remaining today`,
			});

			return;
		}

		setIsSubmitting(true);

		try {
			const platform = detectPlatform(data.meetingUrl);

			if (platform === "unknown" || platform === null) {
				form.setError("meetingUrl", {
					message: "Please enter a valid Google Meet, Teams, or Zoom URL",
				});

				setIsSubmitting(false);

				return;
			}

			const botNames = getRandomBrazilianNames(data.botCount);

			const botCreationPromises = Array.from(
				{ length: data.botCount },
				(_, index) =>
					createBotMutation.mutateAsync({
						botDisplayName: botNames[index] || `Bot ${index + 1}`,
						meetingTitle: "Quick join session",
						meetingInfo: {
							platform,
							meetingUrl: data.meetingUrl,
						},
						recordingEnabled: false,
						startTime: new Date().toISOString(),
						endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
						timeZone: userTimezone,
					}),
			);

			await Promise.all(botCreationPromises);
			await utils.bots.getBots.invalidate();
			await utils.bots.getDailyUsage.invalidate();

			form.reset();
		} catch (error) {
			console.error("Failed to create bots:", error);

			if (error instanceof Error && error.message.includes("Daily bot limit")) {
				form.setError("botCount", { message: error.message });
			}
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="border bg-card">
			<div className="p-6 pb-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold">Deploy Bots</h2>
						<p className="text-sm text-muted-foreground">
							Paste a meeting link to instantly deploy engagement bots
						</p>
					</div>

					<UsageStats
						usage={dailyUsage.usage}
						limit={dailyUsage.limit}
						remaining={dailyUsage.remaining}
					/>
				</div>
			</div>

			<div className="p-6">
				<Form {...form}>
					<form onSubmit={form.handleSubmit(handleSubmit)}>
						<div className="flex gap-3">
							<div className="relative flex-1">
								{detectedPlatform &&
									detectedPlatform !== "unknown" &&
									detectedPlatform !== null && (
										<div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
											<Image
												src={`/platform-logos/${detectedPlatform}.svg`}
												alt={`${detectedPlatform} logo`}
												width={20}
												height={20}
											/>
										</div>
									)}

								<FormField
									control={form.control}
									name="meetingUrl"
									render={({ field }) => (
										<FormItem className="flex-1">
											<FormControl>
												<Input
													placeholder="https://meet.google.com/abc-defg-hij"
													className={
														detectedPlatform &&
														detectedPlatform !== "unknown" &&
														detectedPlatform !== null
															? "pl-10 h-12 text-base"
															: "h-12 text-base"
													}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							<FormField
								control={form.control}
								name="botCount"
								render={({ field }) => (
									<FormItem>
										<FormControl>
											<Input
												type="number"
												min={1}
												max={isUnlimited ? 256 : Math.min(256, remaining)}
												placeholder="1"
												className="w-20 h-12 text-base text-center tabular-nums"
												{...field}
												value={field.value}
												onChange={(e) =>
													field.onChange(e.target.valueAsNumber || 1)
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<Button
								type="submit"
								size="lg"
								className="h-12 px-6 min-w-[160px]"
								disabled={
									isSubmitting ||
									willExceedQuota ||
									(!isUnlimited && remaining === 0)
								}
							>
								{isSubmitting ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										Deploying...
									</>
								) : (
									<>
										<Rocket className="h-4 w-4" />
										Deploy {botCount > 1 ? `${botCount} Bots` : "Bot"}
									</>
								)}
							</Button>
						</div>

						{willExceedQuota && (
							<Alert className="mt-4 border-amber-500/50 bg-amber-500/10">
								<AlertTriangle className="h-4 w-4 text-amber-500" />
								<AlertDescription className="text-amber-700 dark:text-amber-400">
									You're trying to deploy {botCount} bots, but only have{" "}
									{remaining} remaining today.
								</AlertDescription>
							</Alert>
						)}
					</form>
				</Form>
			</div>
		</div>
	);
}

export function QuickBotJoinSkeleton() {
	return (
		<div className="border bg-card">
			<div className="p-6 pb-4 border-b">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold">Deploy Bots</h2>
						<p className="text-sm text-muted-foreground">
							Paste a meeting link to instantly deploy engagement bots
						</p>
					</div>

					<UsageStatsSkeleton />
				</div>
			</div>

			<div className="p-6">
				<div className="flex gap-3">
					<div className="flex-1">
						<Skeleton className="h-12 w-full" />
					</div>
					<Skeleton className="w-20 h-12" />
					<Skeleton className="w-[160px] h-12" />
				</div>
			</div>
		</div>
	);
}
