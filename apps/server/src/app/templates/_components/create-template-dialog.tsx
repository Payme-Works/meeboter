"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
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

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Message Template</DialogTitle>
					<DialogDescription>
						Create a template with multiple message variations. Each bot will
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
							Add multiple message variations. Each bot will randomly choose one
							when sending.
						</p>

						<div className="space-y-3">
							{messages.map((message, index) => (
								<div key={message.id} className="flex gap-2">
									<div className="flex-1 space-y-1">
										<Label className="text-xs text-muted-foreground">
											Variation {index + 1}
										</Label>
										<Input
											value={message.value}
											onChange={(e) =>
												updateMessage(message.id, e.target.value)
											}
											placeholder={`Enter message variation ${index + 1}...`}
											className="min-h-[40px]"
										/>
									</div>

									{messages.length > 1 && (
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onClick={() => removeMessage(message.id)}
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
						<Button type="submit" disabled={createTemplate.isPending}>
							{createTemplate.isPending ? "Creating..." : "Create Template"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
