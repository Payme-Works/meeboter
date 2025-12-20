"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Ban } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { getRandomBrazilianNames } from "@/utils/random-names";

const multiBotSchema = z.object({
	meetingUrl: z.string().min(1, "Meeting URL is required"),
	botCount: z
		.number()
		.min(1, "At least 1 bot is required")
		.max(256, "Maximum 256 bots allowed"),
});

type MultiBotFormData = z.infer<typeof multiBotSchema>;

interface MultiBotJoinDialogProps {
	open: boolean;
	onClose: () => void;
}

function SubmitButtonText({
	isSubmitting,
	willExceedQuota,
	isUnlimited,
	remaining,
}: {
	isSubmitting: boolean;
	willExceedQuota: boolean;
	isUnlimited: boolean;
	remaining: number;
}) {
	if (isSubmitting) return "Creating Bots...";

	if (willExceedQuota) return "Exceeds Quota";

	if (!isUnlimited && remaining === 0) return "No Quota Remaining";

	return "Create Bots";
}

export function MultiBotJoinDialog({ open, onClose }: MultiBotJoinDialogProps) {
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm<MultiBotFormData>({
		resolver: zodResolver(multiBotSchema),
		defaultValues: {
			meetingUrl: "",
			botCount: 1,
		},
	});

	const createBotMutation = api.bots.createBot.useMutation();
	const utils = api.useUtils();

	// Get user's timezone
	const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	// Fetch subscription and usage data
	const { data: subscriptionInfo, isLoading: subLoading } =
		api.bots.getUserSubscription.useQuery();

	const { data: dailyUsage, isLoading: usageLoading } =
		api.bots.getDailyUsage.useQuery({
			timeZone: userTimezone,
		});

	const detectPlatform = (
		url: string,
	): "google" | "microsoft-teams" | "zoom" => {
		if (url.includes("meet.google.com")) return "google";

		if (url.includes("teams.microsoft.com") || url.includes("teams.live.com"))
			return "microsoft-teams";

		if (url.includes("zoom.us")) return "zoom";

		return "google"; // Default to google
	};

	// Calculate quota validation
	const remaining = dailyUsage?.remaining ?? 0;
	const isUnlimited = dailyUsage?.remaining === null;
	const botCount = form.watch("botCount") || 1;
	const willExceedQuota = !isUnlimited && remaining < botCount;

	const formatPlanName = (plan: string) => {
		switch (plan) {
			case "FREE":
				return "Free";
			case "PRO":
				return "Pro";
			case "PAY_AS_YOU_GO":
				return "Pay-as-You-Go";
			case "CUSTOM":
				return "Enterprise";
			default:
				return plan;
		}
	};

	const handleSubmit = async (data: MultiBotFormData) => {
		// Pre-validation before submission
		if (!isUnlimited && remaining < data.botCount) {
			form.setError("botCount", {
				message: `Not enough bots remaining. You have ${remaining} bots left today.`,
			});

			return;
		}

		setIsSubmitting(true);

		try {
			const platform = detectPlatform(data.meetingUrl);
			const botNames = getRandomBrazilianNames(data.botCount);

			// Create multiple bots
			const botCreationPromises = Array.from(
				{ length: data.botCount },
				(_, index) =>
					createBotMutation.mutateAsync({
						botDisplayName: botNames[index] || `Bot ${index + 1}`,
						meetingTitle: `${data.botCount}-bots-session`,
						meetingInfo: {
							platform,
							meetingUrl: data.meetingUrl,
						},
						recordingEnabled: false,
						startTime: new Date().toISOString(),
						endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
						timeZone: userTimezone,
					}),
			);

			await Promise.all(botCreationPromises);

			// Refresh bots list, usage data, and pool stats
			await utils.bots.getBots.invalidate();
			await utils.bots.getDailyUsage.invalidate();
			await utils.pool.statistics.getPool.invalidate();

			form.reset();

			onClose();
		} catch (error) {
			console.error(
				"[app/bots/_components/multi-bot-join-dialog.tsx > handleSubmit] Failed to create bots",
				error,
			);

			// Handle specific quota errors from the server
			if (error instanceof Error && error.message.includes("Daily bot limit")) {
				form.setError("botCount", {
					message: error.message,
				});
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Join Multiple Bots to Meeting</DialogTitle>
					<DialogDescription>
						Add multiple bots to any meeting platform (Google Meet, Microsoft
						Teams, or Zoom)
					</DialogDescription>
				</DialogHeader>

				{/* Subscription & Quota Information */}
				{subLoading || usageLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-48" />
					</div>
				) : (
					<div className="space-y-3 rounded-lg bg-muted p-3">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Current Plan:</span>
							<Badge
								className="border border-zinc-500"
								variant={
									subscriptionInfo?.currentPlan === "FREE"
										? "secondary"
										: "default"
								}
							>
								{subscriptionInfo
									? formatPlanName(subscriptionInfo.currentPlan)
									: "Free"}
							</Badge>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Today's Usage:</span>
							<span className="text-sm">
								{dailyUsage
									? `${dailyUsage.usage}/${isUnlimited ? "∞" : dailyUsage.limit}`
									: "0/0"}
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Remaining Today:</span>
							<span className="text-sm font-semibold">
								{isUnlimited ? "Unlimited" : remaining}
							</span>
						</div>
					</div>
				)}

				<Separator />

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className="space-y-4"
					>
						<FormField
							control={form.control}
							name="meetingUrl"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Meeting URL</FormLabel>
									<FormControl>
										<Input
											placeholder="https://meet.google.com/abc-defg-hij"
											{...field}
										/>
									</FormControl>
									<FormDescription>
										Supports Google Meet, Microsoft Teams, and Zoom links
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="botCount"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Number of Bots</FormLabel>
									<FormControl>
										<Input
											type="number"
											min="1"
											max={
												isUnlimited
													? "256"
													: Math.min(256, remaining).toString()
											}
											placeholder="1"
											{...field}
											value={field.value}
											onChange={(e) =>
												field.onChange(e.target.valueAsNumber || 1)
											}
										/>
									</FormControl>
									<FormDescription>
										{isUnlimited
											? "Number of bots to join the meeting (1-256)"
											: `Number of bots to join (1-${Math.min(256, remaining)} remaining today)`}
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Quota Warning */}
						{willExceedQuota && (
							<Alert className="border-amber-200 bg-amber-50">
								<AlertTriangle className="h-4 w-4" />
								<AlertDescription className="text-amber-800">
									You're trying to create {botCount} bots, but only have{" "}
									{remaining} bots remaining today.
									{subscriptionInfo?.currentPlan === "FREE" &&
										"Consider upgrading to Pro for 200 bots/day."}
								</AlertDescription>
							</Alert>
						)}

						{/* No quota remaining warning */}
						{!isUnlimited && remaining === 0 && (
							<Alert className="border-red-200 bg-red-50">
								<Ban className="h-4 w-4" />
								<AlertDescription className="text-red-800">
									You've reached your daily bot limit.
									{subscriptionInfo?.currentPlan === "FREE" && (
										<>
											{" "}
											Upgrade to Pro for 200 bots/day or wait until tomorrow for
											your limit to reset.
										</>
									)}
								</AlertDescription>
							</Alert>
						)}

						<div className="flex justify-end space-x-2">
							<Button type="button" variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={
									isSubmitting ||
									willExceedQuota ||
									(!isUnlimited && remaining === 0)
								}
							>
								<SubmitButtonText
									isSubmitting={isSubmitting}
									willExceedQuota={willExceedQuota}
									isUnlimited={isUnlimited}
									remaining={remaining}
								/>
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
