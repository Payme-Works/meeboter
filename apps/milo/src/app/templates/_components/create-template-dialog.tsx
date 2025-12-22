"use client";

import { GripVertical, Loader2, Plus, Shuffle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

interface CreateTemplateDialogProps {
	open: boolean;
	onClose: () => void;
	onTemplateCreated: () => void;
}

export function CreateTemplateDialog({
	open,
	onClose,
	onTemplateCreated,
}: CreateTemplateDialogProps) {
	const [templateName, setTemplateName] = useState("");

	const [messages, setMessages] = useState<{ id: string; value: string }[]>([
		{ id: crypto.randomUUID(), value: "" },
	]);

	const createTemplate = api.chat.createMessageTemplate.useMutation({
		onSuccess: () => {
			toast.success("Template created successfully");
			onTemplateCreated();
			resetForm();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const resetForm = () => {
		setTemplateName("");
		setMessages([{ id: crypto.randomUUID(), value: "" }]);
	};

	const handleClose = () => {
		resetForm();
		onClose();
	};

	const addMessage = () => {
		setMessages([...messages, { id: crypto.randomUUID(), value: "" }]);
	};

	const removeMessage = (id: string) => {
		if (messages.length > 1) {
			setMessages(messages.filter((msg) => msg.id !== id));
		}
	};

	const updateMessage = (id: string, value: string) => {
		setMessages(
			messages.map((msg) => (msg.id === id ? { ...msg, value } : msg)),
		);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		const validMessages = messages
			.filter((msg) => msg.value.trim().length > 0)
			.map((msg) => msg.value);

		if (!templateName.trim()) {
			toast.error("Template name is required");

			return;
		}

		if (validMessages.length === 0) {
			toast.error("At least one message variation is required");

			return;
		}

		createTemplate.mutate({
			templateName: templateName.trim(),
			messages: validMessages,
		});
	};

	const filledCount = messages.filter((m) => m.value.trim()).length;

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Message Template</DialogTitle>
					<DialogDescription>
						Build a template with multiple variations for natural, randomized
						messaging
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-6">
					{/* Template Name */}
					<div>
						<Label htmlFor="templateName" className="text-sm font-medium">
							Template Name
						</Label>
						<Input
							id="templateName"
							value={templateName}
							onChange={(e) => setTemplateName(e.target.value)}
							placeholder="e.g., Greeting Messages, Follow-up Reminders..."
							className="mt-2"
							required
						/>
					</div>

					{/* Message Variations */}
					<div className="space-y-4">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Label className="text-sm font-medium">
									Message Variations
								</Label>
								<Badge
									variant="secondary"
									className={cn(
										"text-xs",
										filledCount > 0
											? "bg-primary/10 text-primary border-primary/20"
											: "bg-muted text-muted-foreground",
									)}
								>
									{filledCount} of {messages.length}
								</Badge>
							</div>
							<div className="flex items-center gap-1 text-xs text-muted-foreground">
								<Shuffle className="h-3 w-3" />
								Random selection
							</div>
						</div>

						<div className="space-y-3">
							{messages.map((message, index) => (
								<div
									key={message.id}
									className="group relative bg-muted/30 border rounded-lg p-3 transition-all duration-150 hover:border-primary/30 focus-within:border-primary/50 focus-within:bg-muted/50"
								>
									{/* Card Header */}
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-2">
											<div className="flex items-center gap-1 text-muted-foreground/50">
												<GripVertical className="h-4 w-4" />
											</div>
											<Badge
												variant="outline"
												className="h-5 px-1.5 text-[10px] font-mono bg-background"
											>
												#{index + 1}
											</Badge>
										</div>

										<div className="flex items-center gap-2">
											<span
												className={cn(
													"text-[10px] font-mono transition-colors",
													message.value.length > 0
														? "text-muted-foreground"
														: "text-muted-foreground/40",
												)}
											>
												{message.value.length}/500
											</span>

											{messages.length > 1 && (
												<Button
													type="button"
													variant="ghost"
													size="icon"
													onClick={() => removeMessage(message.id)}
													className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white hover:bg-destructive"
												>
													<Trash2 className="h-3 w-3" />
												</Button>
											)}
										</div>
									</div>

									{/* Message Input */}
									<Textarea
										value={message.value}
										onChange={(e) => updateMessage(message.id, e.target.value)}
										placeholder={getPlaceholder(index)}
										maxLength={500}
										className="min-h-[60px] resize-none border-0 bg-transparent p-0 focus-visible:ring-0 text-sm placeholder:text-muted-foreground/50"
									/>
								</div>
							))}

							{/* Add Variation Button */}
							<button
								type="button"
								onClick={addMessage}
								className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed rounded-lg text-sm text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all duration-150"
							>
								<Plus className="h-4 w-4" />
								Add Variation
							</button>
						</div>
					</div>

					<DialogFooter className="flex-col sm:flex-row sm:justify-between gap-4">
						<p className="text-xs text-muted-foreground">
							Bots randomly select one variation per message
						</p>
						<div className="flex gap-2">
							<Button type="button" variant="outline" onClick={handleClose}>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={createTemplate.isPending || filledCount === 0}
							>
								{createTemplate.isPending ? (
									<>
										<Loader2 className="h-4 w-4 animate-spin" />
										Creating...
									</>
								) : (
									"Create Template"
								)}
							</Button>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function getPlaceholder(index: number): string {
	const placeholders = [
		"Hi there! Just wanted to check in...",
		"Hey! Hope you're doing well...",
		"Hello! Quick question for you...",
		"Hi! Following up on our conversation...",
		"Hey there! Just a friendly reminder...",
	];

	return placeholders[index % placeholders.length] ?? "Enter your message...";
}
