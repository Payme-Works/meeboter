"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

const multiBotSchema = z.object({
	meetingUrl: z.string().min(1, "Meeting URL is required"),
	botCount: z.coerce.number().min(1, "At least 1 bot is required").max(10, "Maximum 10 bots allowed"),
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

	const detectPlatform = (url: string): string => {
		if (url.includes("meet.google.com")) return "meet";
		if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
		if (url.includes("zoom.us")) return "zoom";
		return "meet"; // Default to meet
	};

	const onSubmit = async (data: MultiBotFormData) => {
		setIsSubmitting(true);
		
		try {
			const platform = detectPlatform(data.meetingUrl);
			
			// Create multiple bots
			const botCreationPromises = Array.from({ length: data.botCount }, (_, index) =>
				createBotMutation.mutateAsync({
					botDisplayName: `Bot ${index + 1}`,
					meetingTitle: `Multi-bot session ${index + 1}`,
					meetingInfo: {
						platform,
						url: data.meetingUrl,
					},
					recordingEnabled: false,
					startTime: new Date(),
					endTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
				})
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
						Add multiple bots to any meeting platform (Google Meet, Microsoft Teams, or Zoom)
					</DialogDescription>
				</DialogHeader>
				
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
											max="10"
											placeholder="1"
											{...field} 
										/>
									</FormControl>
									<FormDescription>
										Number of bots to join the meeting (1-10)
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