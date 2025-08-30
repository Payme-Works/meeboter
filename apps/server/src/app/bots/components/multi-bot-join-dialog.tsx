"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { api } from "@/trpc/react";
import { getRandomBrazilianNames } from "@/utils/random-names";

const multiBotSchema = z.object({
	meetingUrl: z.string().min(1, "Meeting URL is required"),
	botCount: z
		.number()
		.min(1, "At least 1 bot is required")
		.max(128, "Maximum 128 bots allowed"),
});

type MultiBotFormData = z.infer<typeof multiBotSchema>;

interface MultiBotJoinDialogProps {
	open: boolean;
	onClose: () => void;
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

	const detectPlatform = (url: string): "google" | "teams" | "zoom" => {
		if (url.includes("meet.google.com")) return "google";

		if (url.includes("teams.microsoft.com") || url.includes("teams.live.com"))
			return "teams";

		if (url.includes("zoom.us")) return "zoom";

		return "google"; // Default to google
	};

	const handleSubmit = async (data: MultiBotFormData) => {
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
						meetingTitle: `Multi-bot session`,
						meetingInfo: {
							platform,
							meetingUrl: data.meetingUrl,
						},
						recordingEnabled: false,
						startTime: new Date().toISOString(),
						endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
					}),
			);

			await Promise.all(botCreationPromises);

			// Refresh bots list
			await utils.bots.getBots.invalidate();

			form.reset();

			onClose();
		} catch (error) {
			console.error("Failed to create bots:", error);
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
											max="128"
											placeholder="1"
											{...field}
											value={field.value}
											onChange={(e) =>
												field.onChange(e.target.valueAsNumber || 1)
											}
										/>
									</FormControl>
									<FormDescription>
										Number of bots to join the meeting (1-128)
									</FormDescription>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex justify-end space-x-2">
							<Button type="button" variant="outline" onClick={onClose}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Creating Bots..." : "Create Bots"}
							</Button>
						</div>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
