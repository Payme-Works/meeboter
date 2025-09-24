"use client";

import { Bot, MessageSquare, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { SelectBotType } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface MultiBotChatDialogProps {
	open: boolean;
	onClose: () => void;
	bots: SelectBotType[];
}

export function MultiBotChatDialog({
	open,
	onClose,
	bots,
}: MultiBotChatDialogProps) {
	const [selectedBotIds, setSelectedBotIds] = useState<number[]>([]);

	const [messageType, setMessageType] = useState<"manual" | "template">(
		"template",
	);

	const [manualMessage, setManualMessage] = useState("");
	const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

	const { data: templates = [] } = api.chat.getMessageTemplates.useQuery();

	const sendTemplate = api.chat.sendTemplateToMultipleBots.useMutation({
		onSuccess: (result) => {
			toast.success(
				`Template sent to ${result.messagesSent} bot${result.messagesSent !== 1 ? "s" : ""}`,
			);

			if (result.errors && result.errors.length > 0) {
				result.errors.forEach((error) => {
					toast.error(error);
				});
			}

			resetForm();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const sendMessage = api.chat.sendMessageToMultipleBots.useMutation({
		onSuccess: (result) => {
			toast.success(
				`Message sent to ${result.messagesSent} bot${result.messagesSent !== 1 ? "s" : ""}`,
			);

			if (result.errors && result.errors.length > 0) {
				result.errors.forEach((error) => {
					toast.error(error);
				});
			}

			resetForm();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const resetForm = () => {
		setSelectedBotIds([]);
		setMessageType("template");
		setManualMessage("");
		setSelectedTemplateId("");
		onClose();
	};

	const handleClose = () => {
		resetForm();
	};

	const handleBotSelection = (botId: number, checked: boolean | string) => {
		if (checked) {
			setSelectedBotIds([...selectedBotIds, botId]);
		} else {
			setSelectedBotIds(selectedBotIds.filter((id) => id !== botId));
		}
	};

	const selectAllActiveBots = () => {
		const activeBots = bots.filter(
			(bot) => bot.chatEnabled && !["DONE", "FATAL"].includes(bot.status),
		);

		setSelectedBotIds(activeBots.map((bot) => bot.id));
	};

	const clearSelection = () => {
		setSelectedBotIds([]);
	};

	const getSelectedTemplate = () => {
		return templates.find((t) => t.id.toString() === selectedTemplateId);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (selectedBotIds.length === 0) {
			toast.error("Please select at least one bot");

			return;
		}

		if (messageType === "template") {
			if (!selectedTemplateId) {
				toast.error("Please select a template");

				return;
			}

			sendTemplate.mutate({
				templateId: parseInt(selectedTemplateId, 10),
				botIds: selectedBotIds,
			});
		} else {
			if (!manualMessage.trim()) {
				toast.error("Please enter a message");

				return;
			}

			sendMessage.mutate({
				messageText: manualMessage.trim(),
				botIds: selectedBotIds,
			});
		}
	};

	const activeBots = bots.filter(
		(bot) => bot.chatEnabled && !["DONE", "FATAL"].includes(bot.status),
	);

	const isPending = sendTemplate.isPending || sendMessage.isPending;

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<MessageSquare className="h-5 w-5" />
						Send Messages to Multiple Bots
					</DialogTitle>
					<DialogDescription>
						Select bots and choose a message template or write a custom message
						to send to all selected bots.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-6">
					{/* Bot Selection */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<Label className="text-base font-medium">Select Bots</Label>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={selectAllActiveBots}
									disabled={activeBots.length === 0}
								>
									<Users className="h-4 w-4 mr-2" />
									Select All Active ({activeBots.length})
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={clearSelection}
									disabled={selectedBotIds.length === 0}
								>
									Clear Selection
								</Button>
							</div>
						</div>

						{activeBots.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								<Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
								<p>No active bots with chat enabled found</p>
							</div>
						) : (
							<div className="border rounded-lg p-4 max-h-40 overflow-y-auto">
								<div className="grid grid-cols-1 gap-2">
									{activeBots.map((bot) => (
										<div key={bot.id} className="flex items-center space-x-2">
											<Checkbox
												id={`bot-${bot.id}`}
												checked={selectedBotIds.includes(bot.id)}
												onCheckedChange={(checked) =>
													handleBotSelection(bot.id, checked as boolean)
												}
											/>
											<Label
												htmlFor={`bot-${bot.id}`}
												className="flex-1 cursor-pointer"
											>
												<div className="flex items-center justify-between">
													<span>{bot.meetingTitle}</span>
													<span className="text-xs text-muted-foreground">
														{bot.status}
													</span>
												</div>
											</Label>
										</div>
									))}
								</div>
							</div>
						)}

						{selectedBotIds.length > 0 && (
							<div className="text-sm text-muted-foreground">
								{selectedBotIds.length} bot
								{selectedBotIds.length !== 1 ? "s" : ""} selected
							</div>
						)}
					</div>

					{/* Message Type Selection */}
					<div className="space-y-4">
						<Label className="text-base font-medium">Message Type</Label>
						<div className="flex gap-4">
							<Label className="flex items-center space-x-2 cursor-pointer">
								<input
									type="radio"
									name="messageType"
									value="template"
									checked={messageType === "template"}
									onChange={(e) => setMessageType(e.target.value as "template")}
								/>
								<span>Use Template (Randomized)</span>
							</Label>
							<Label className="flex items-center space-x-2 cursor-pointer">
								<input
									type="radio"
									name="messageType"
									value="manual"
									checked={messageType === "manual"}
									onChange={(e) => setMessageType(e.target.value as "manual")}
								/>
								<span>Custom Message</span>
							</Label>
						</div>
					</div>

					{/* Template Selection */}
					{messageType === "template" && (
						<div className="space-y-4">
							<Label htmlFor="template-select">Select Template</Label>
							<Select
								value={selectedTemplateId}
								onValueChange={setSelectedTemplateId}
							>
								<SelectTrigger>
									<SelectValue placeholder="Choose a message template..." />
								</SelectTrigger>
								<SelectContent>
									{templates.map((template) => (
										<SelectItem
											key={template.id}
											value={template.id.toString()}
										>
											<div className="flex flex-col items-start">
												<span className="font-medium">
													{template.templateName}
												</span>
												<span className="text-xs text-muted-foreground">
													{template.messages.length} variation
													{template.messages.length !== 1 ? "s" : ""}
												</span>
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>

							{selectedTemplateId && getSelectedTemplate() && (
								<div className="bg-muted p-3 rounded-lg space-y-2">
									<Label className="text-sm font-medium">
										Template Preview:
									</Label>
									<div className="space-y-1">
										{getSelectedTemplate()
											?.messages.slice(0, 3)
											.map((message, index) => (
												<div
													key={`${message.slice(0, 20)}-${index}`}
													className="text-sm"
												>
													• {message}
												</div>
											))}
										{(getSelectedTemplate()?.messages.length ?? 0) > 3 && (
											<div className="text-sm text-muted-foreground">
												• ...and{" "}
												{(getSelectedTemplate()?.messages.length ?? 0) - 3} more
												variations
											</div>
										)}
									</div>
									<p className="text-xs text-muted-foreground mt-2">
										Each bot will randomly select one variation to send.
									</p>
								</div>
							)}
						</div>
					)}

					{/* Manual Message Input */}
					{messageType === "manual" && (
						<div className="space-y-2">
							<Label htmlFor="manual-message">Custom Message</Label>
							<Input
								id="manual-message"
								value={manualMessage}
								onChange={(e) => setManualMessage(e.target.value)}
								placeholder="Enter your message..."
								maxLength={1000}
								required={messageType === "manual"}
							/>
							<div className="text-xs text-muted-foreground text-right">
								{manualMessage.length}/1000 characters
							</div>
							<p className="text-sm text-muted-foreground">
								This exact message will be sent to all selected bots.
							</p>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={isPending || selectedBotIds.length === 0}
						>
							{isPending
								? "Sending..."
								: `Send to ${selectedBotIds.length} Bot${selectedBotIds.length !== 1 ? "s" : ""}`}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
