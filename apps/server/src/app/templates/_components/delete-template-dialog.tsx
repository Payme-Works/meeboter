"use client";

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
import type { SelectMessageTemplateType } from "@/server/database/schema";
import { api } from "@/trpc/react";

interface DeleteTemplateDialogProps {
	template: SelectMessageTemplateType | null;
	onClose: () => void;
	onTemplateDeleted: () => void;
}

export function DeleteTemplateDialog({
	template,
	onClose,
	onTemplateDeleted,
}: DeleteTemplateDialogProps) {
	const deleteTemplate = api.chat.deleteMessageTemplate.useMutation({
		onSuccess: () => {
			toast.success("Template deleted successfully");
			onTemplateDeleted();
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const handleDelete = () => {
		if (!template) return;

		deleteTemplate.mutate({
			id: template.id.toString(),
		});
	};

	if (!template) return null;

	return (
		<Dialog open={!!template} onOpenChange={onClose}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete Template</DialogTitle>
					<DialogDescription>
						Are you sure you want to delete the template "
						{template.templateName}"? This action cannot be undone and will
						remove all {template.messages.length} message variation
						{template.messages.length !== 1 ? "s" : ""}.
					</DialogDescription>
				</DialogHeader>

				<div className="bg-muted p-4 rounded-lg">
					<h4 className="font-medium mb-2">{template.templateName}</h4>
					<div className="space-y-1">
						{template.messages.slice(0, 3).map((message, index) => (
							<div
								key={`preview-${index}-${message.slice(0, 10)}`}
								className="text-sm text-muted-foreground"
							>
								• {message}
							</div>
						))}
						{template.messages.length > 3 && (
							<div className="text-sm text-muted-foreground">
								• ...and {template.messages.length - 3} more
							</div>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={deleteTemplate.isPending}
					>
						{deleteTemplate.isPending ? "Deleting..." : "Delete Template"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
