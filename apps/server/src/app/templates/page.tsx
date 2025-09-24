"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import type { SelectMessageTemplateType } from "@/server/database/schema";
import { api } from "@/trpc/react";
import { CreateTemplateDialog } from "./_components/create-template-dialog";
import { DeleteTemplateDialog } from "./_components/delete-template-dialog";
import { EditTemplateDialog } from "./_components/edit-template-dialog";

export default function TemplatesPage() {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

	const [editingTemplate, setEditingTemplate] =
		useState<SelectMessageTemplateType | null>(null);

	const [deletingTemplate, setDeletingTemplate] =
		useState<SelectMessageTemplateType | null>(null);

	const { data: session } = useSession();

	const {
		data: templates = [],
		isLoading,
		error,
		refetch,
	} = api.chat.getMessageTemplates.useQuery();

	type Template = (typeof templates)[number];

	const columns: ColumnDef<Template>[] = [
		{
			accessorKey: "templateName",
			header: "Template Name",
			cell: ({ row }) => (
				<div className="font-medium">{row.original.templateName}</div>
			),
		},
		{
			accessorKey: "messageCount",
			header: "Message Variations",
			cell: ({ row }) => (
				<div className="text-sm text-muted-foreground">
					{row.original.messages.length} variation
					{row.original.messages.length !== 1 ? "s" : ""}
				</div>
			),
		},
		{
			accessorKey: "messagePreview",
			header: "Preview",
			cell: ({ row }) => (
				<div className="max-w-md">
					<div className="text-sm truncate">{row.original.messages[0]}</div>
					{row.original.messages.length > 1 && (
						<div className="text-xs text-muted-foreground">
							+{row.original.messages.length - 1} more
						</div>
					)}
				</div>
			),
		},
		{
			accessorKey: "createdAt",
			header: "Created",
			cell: ({ row }) => {
				const createdAt = row.original.createdAt;

				const timeAgo = createdAt
					? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
					: "Unknown";

				return <div className="text-sm text-muted-foreground">{timeAgo}</div>;
			},
		},
		{
			id: "actions",
			header: "Actions",
			cell: ({ row }) => (
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setEditingTemplate(row.original)}
					>
						<Edit2 className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setDeletingTemplate(row.original)}
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			),
		},
	];

	const handleTemplateCreated = () => {
		setCreateDialogOpen(false);

		refetch();
	};

	const handleTemplateUpdated = () => {
		setEditingTemplate(null);
		refetch();
	};

	const handleTemplateDeleted = () => {
		setDeletingTemplate(null);
		refetch();
	};

	return (
		<div className="mx-auto container space-y-4 px-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">
						Message Templates
					</h2>
					<p className="text-muted-foreground">
						Create and manage reusable message templates with multiple
						variations.
					</p>
				</div>

				<Button
					onClick={() => setCreateDialogOpen(true)}
					disabled={!session?.user}
				>
					<Plus className="h-4 w-4 mr-2" />
					Create Template
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={templates}
				isLoading={isLoading}
				errorMessage={error?.message}
			/>

			<CreateTemplateDialog
				open={createDialogOpen}
				onClose={() => setCreateDialogOpen(false)}
				onTemplateCreated={handleTemplateCreated}
			/>

			<EditTemplateDialog
				template={editingTemplate}
				onClose={() => setEditingTemplate(null)}
				onTemplateUpdated={handleTemplateUpdated}
			/>

			<DeleteTemplateDialog
				template={deletingTemplate}
				onClose={() => setDeletingTemplate(null)}
				onTemplateDeleted={handleTemplateDeleted}
			/>
		</div>
	);
}
