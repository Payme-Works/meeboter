"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
import type { SelectMessageTemplateType } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface EditTemplateDialogProps {
	template: SelectMessageTemplateType | null;
	onClose: () => void;
	onTemplateUpdated: () => void;
}

export function EditTemplateDialog({
	template,
	onClose,
	onTemplateUpdated,
}: EditTemplateDialogProps) {
	const [templateName, setTemplateName] = useState("");
	const [messages, setMessages] = useState<string[]>([""]);

	const updateTemplate = api.chat.updateMessageTemplate.useMutation({
		onSuccess: () => {
			toast.success("Template updated successfully");
			onTemplateUpdated();
			resetForm();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const resetForm = useCallback(() => {
		setTemplateName("");
		setMessages([""]);
	}, []);

	// Initialize form when template changes
	useEffect(() => {
		if (template) {
			setTemplateName(template.templateName);
			setMessages(template.messages.length > 0 ? [...template.messages] : [""]);
		} else {
			resetForm();
		}
	}, [template, resetForm]);

	const handleClose = () => {
		resetForm();
		onClose();
	};

	const addMessage = () => {
		setMessages([...messages, ""]);
	};

	const removeMessage = (index: number) => {
		if (messages.length > 1) {
			setMessages(messages.filter((_, i) => i !== index));
		}
	};

	const updateMessage = (index: number, value: string) => {
		const newMessages = [...messages];
		newMessages[index] = value;
		setMessages(newMessages);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!template) return;

		const validMessages = messages.filter((msg) => msg.trim().length > 0);

		if (!templateName.trim()) {
			toast.error("Template name is required");

			return;
		}

		if (validMessages.length === 0) {
			toast.error("At least one message variation is required");

			return;
		}

		updateTemplate.mutate({
			id: template.id.toString(),
			data: {
				templateName: templateName.trim(),
				messages: validMessages,
			},
		});
	};

	if (!template) return null;

	return (
		<Dialog open={!!template} onOpenChange={handleClose}>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Edit Message Template</DialogTitle>
					<DialogDescription>
						Update your template and its message variations. Each bot will
						randomly select one variation when sending.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="templateName">Template Name</Label>
						<Input
							id="templateName"
							value={templateName}
							onChange={(e) => setTemplateName(e.target.value)}
							placeholder="Enter template name..."
							required
						/>
					</div>

					<div className="space-y-2">
						<Label>Message Variations</Label>
						<p className="text-sm text-muted-foreground">
							Update message variations. Each bot will randomly choose one when
							sending.
						</p>

						<div className="space-y-3">
							{messages.map((message, index) => (
								<div key={message + Math.random()} className="flex gap-2">
									<div className="flex-1 space-y-1">
										<Label className="text-xs text-muted-foreground">
											Variation {index + 1}
										</Label>
										<Input
											value={message}
											onChange={(e) => updateMessage(index, e.target.value)}
											placeholder={`Enter message variation ${index + 1}...`}
											className="min-h-[40px]"
										/>
									</div>

									{messages.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => removeMessage(index)}
											className="mt-6 text-destructive hover:text-destructive"
										>
											<X className="h-4 w-4" />
										</Button>
									)}
								</div>
							))}
						</div>

						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addMessage}
							className="w-full"
						>
							<Plus className="h-4 w-4 mr-2" />
							Add Another Variation
						</Button>
					</div>

					<DialogFooter className="flex gap-2">
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={updateTemplate.isPending}>
							{updateTemplate.isPending ? "Updating..." : "Update Template"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
