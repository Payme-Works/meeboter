"use client";

import { Bot, Check, Radio, Send, Sparkles, Users, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { cn } from "@/lib/utils";
import type { SelectBotType } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface BroadcastCenterDialogProps {
	open: boolean;
	onClose: () => void;
	bots: SelectBotType[];
}

export function BroadcastCenterDialog({
	open,
	onClose,
	bots,
}: BroadcastCenterDialogProps) {
	const [selectedBotIds, setSelectedBotIds] = useState<number[]>([]);

	const [messageType, setMessageType] = useState<"template" | "custom">(
		"template",
	);

	const [customMessage, setCustomMessage] = useState("");
	const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

	const { data: templatesResponse } = api.chat.getMessageTemplates.useQuery({
		page: 1,
		pageSize: 100,
	});

	const templates = templatesResponse?.data ?? [];

	const sendTemplate = api.chat.sendTemplateToMultipleBots.useMutation({
		onSuccess: (result) => {
			toast.success(
				`Broadcast sent to ${result.messagesSent} bot${result.messagesSent !== 1 ? "s" : ""}`,
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
				`Broadcast sent to ${result.messagesSent} bot${result.messagesSent !== 1 ? "s" : ""}`,
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
		setCustomMessage("");
		setSelectedTemplateId("");
		onClose();
	};

	const handleBotToggle = (botId: number) => {
		setSelectedBotIds((prev) =>
			prev.includes(botId)
				? prev.filter((id) => id !== botId)
				: [...prev, botId],
		);
	};

	const selectAllActiveBots = () => {
		const activeBots = bots.filter(
			(bot) => bot.chatEnabled && bot.status === "IN_CALL",
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
			toast.error("Select at least one bot to broadcast");

			return;
		}

		if (messageType === "template") {
			if (!selectedTemplateId) {
				toast.error("Select a template to broadcast");

				return;
			}

			sendTemplate.mutate({
				templateId: parseInt(selectedTemplateId, 10),
				botIds: selectedBotIds,
			});
		} else {
			if (!customMessage.trim()) {
				toast.error("Enter a message to broadcast");

				return;
			}

			sendMessage.mutate({
				messageText: customMessage.trim(),
				botIds: selectedBotIds,
			});
		}
	};

	const activeBots = bots.filter(
		(bot) => bot.chatEnabled && bot.status === "IN_CALL",
	);

	const isPending = sendTemplate.isPending || sendMessage.isPending;

	const isReady =
		selectedBotIds.length > 0 &&
		(messageType === "template" ? selectedTemplateId : customMessage.trim());

	return (
		<Dialog open={open} onOpenChange={resetForm}>
			<DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden border-0 [&_[data-slot=dialog-close]]:text-white">
				{/* Header */}
				<div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-6 py-5 border-b border-zinc-700">
					<DialogHeader className="space-y-1">
						<DialogTitle className="flex items-center gap-3 text-white text-lg font-semibold tracking-tight">
							<div className="p-2 bg-emerald-500/20 rounded-lg">
								<Radio className="h-5 w-5 text-emerald-400" />
							</div>
							Broadcast Center
						</DialogTitle>
						<DialogDescription className="text-zinc-400 text-sm">
							Send messages to multiple bots simultaneously
						</DialogDescription>
					</DialogHeader>
				</div>

				<form onSubmit={handleSubmit} className="flex flex-col">
					{/* Bot Selection Section */}
					<div className="px-6 py-5 space-y-4 border-b">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Label className="text-sm font-medium">Recipients</Label>
								{selectedBotIds.length > 0 && (
									<Badge
										variant="secondary"
										className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
									>
										{selectedBotIds.length} selected
									</Badge>
								)}
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={selectAllActiveBots}
									disabled={activeBots.length === 0}
									className="text-xs h-7 px-2"
								>
									<Users className="h-3 w-3 mr-1" />
									All ({activeBots.length})
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={clearSelection}
									disabled={selectedBotIds.length === 0}
									className="text-xs h-7 px-2"
								>
									Clear
								</Button>
							</div>
						</div>

						{activeBots.length === 0 ? (
							<div className="flex flex-col items-center justify-center py-8 text-center bg-muted/30 rounded-lg border border-dashed">
								<Bot className="h-8 w-8 text-muted-foreground/50 mb-2" />
								<p className="text-sm text-muted-foreground">
									No active bots with chat enabled
								</p>
								<p className="text-xs text-muted-foreground/70 mt-1">
									Bots must be in a call with chat enabled to receive broadcasts
								</p>
							</div>
						) : (
							<div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-3 bg-muted/30 rounded-lg border">
								{activeBots.map((bot) => {
									const isSelected = selectedBotIds.includes(bot.id);

									return (
										<button
											key={bot.id}
											type="button"
											onClick={() => handleBotToggle(bot.id)}
											className={cn(
												"inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-full border transition-all duration-150",
												isSelected
													? "bg-emerald-500 border-emerald-500 text-white"
													: "bg-background border-border hover:border-emerald-500/50 hover:bg-emerald-500/5",
											)}
										>
											{isSelected && <Check className="h-3 w-3" />}
											<span className="truncate max-w-[150px]">
												{bot.botDisplayName}
											</span>
										</button>
									);
								})}
							</div>
						)}
					</div>

					{/* Message Type Toggle */}
					<div className="px-6 py-5 space-y-4 border-b">
						<div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
							<button
								type="button"
								onClick={() => setMessageType("template")}
								className={cn(
									"flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-150",
									messageType === "template"
										? "bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Wand2 className="h-4 w-4" />
								Template
							</button>
							<button
								type="button"
								onClick={() => setMessageType("custom")}
								className={cn(
									"flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all duration-150",
									messageType === "custom"
										? "bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Sparkles className="h-4 w-4" />
								Custom
							</button>
						</div>

						{/* Template Selection */}
						{messageType === "template" && (
							<div className="space-y-3">
								<Select
									value={selectedTemplateId}
									onValueChange={setSelectedTemplateId}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select a message template..." />
									</SelectTrigger>
									<SelectContent>
										{templates.map((template) => (
											<SelectItem
												key={template.id}
												value={template.id.toString()}
											>
												<div className="flex items-center gap-2">
													<span className="font-medium">
														{template.templateName}
													</span>
													<span className="text-xs opacity-60">
														({template.messages.length} variations)
													</span>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>

								{selectedTemplateId && getSelectedTemplate() && (
									<div className="bg-muted/50 border rounded-lg p-4 space-y-2">
										<div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
											<Wand2 className="h-3 w-3" />
											Message Variations
										</div>
										<div className="space-y-1.5">
											{getSelectedTemplate()
												?.messages.slice(0, 3)
												.map((message, index) => (
													<div
														key={`${message.slice(0, 20)}-${index}`}
														className="text-sm pl-3 border-l-2 border-emerald-500/30 text-muted-foreground"
													>
														{message}
													</div>
												))}
											{(getSelectedTemplate()?.messages.length ?? 0) > 3 && (
												<div className="text-xs text-muted-foreground/70 pl-3">
													+{(getSelectedTemplate()?.messages.length ?? 0) - 3}{" "}
													more variations
												</div>
											)}
										</div>
										<p className="text-xs text-muted-foreground/70 pt-2 border-t border-dashed">
											Each bot receives a randomly selected variation
										</p>
									</div>
								)}
							</div>
						)}

						{/* Custom Message */}
						{messageType === "custom" && (
							<div className="space-y-2">
								<Input
									value={customMessage}
									onChange={(e) => setCustomMessage(e.target.value)}
									placeholder="Type your broadcast message..."
									maxLength={1000}
									className="h-12"
								/>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>Same message sent to all selected bots</span>
									<span>{customMessage.length}/1000</span>
								</div>
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="px-6 py-4 bg-muted/30 flex items-center justify-between">
						<div className="flex items-center gap-2">
							{isReady ? (
								<div className="flex items-center gap-2 text-sm text-emerald-600">
									<div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
									Ready to broadcast
								</div>
							) : (
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
									{selectedBotIds.length === 0
										? "Select recipients"
										: "Choose a message"}
								</div>
							)}
						</div>

						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={resetForm}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={isPending || !isReady}
								className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[140px]"
							>
								{isPending ? (
									<>
										<Radio className="h-4 w-4 animate-pulse mr-2" />
										Broadcasting...
									</>
								) : (
									<>
										<Send className="h-4 w-4 mr-2" />
										Broadcast
									</>
								)}
							</Button>
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
