"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import {
	PageHeader,
	PageHeaderActions,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import type { SelectMessageTemplateType } from "@/server/database/schema";
import { api } from "@/trpc/react";
import { CreateTemplateDialog } from "./_components/create-template-dialog";
import { DeleteTemplateDialog } from "./_components/delete-template-dialog";
import { EditTemplateDialog } from "./_components/edit-template-dialog";

export default function TemplatesPage() {
	const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

	const [pageSize, setPageSize] = useQueryState(
		"pageSize",
		parseAsInteger.withDefault(10),
	);

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

	const columns: ColumnDef<Template>[] = useMemo(
		() => [
			{
				accessorKey: "templateName",
				header: "Template Name",
				cell: ({ row }) => (
					<span className="font-medium">{row.original.templateName}</span>
				),
			},
			{
				accessorKey: "messageCount",
				header: "Variations",
				cell: ({ row }) => (
					<span className="text-muted-foreground tabular-nums">
						{row.original.messages.length}
					</span>
				),
			},
			{
				accessorKey: "messagePreview",
				header: "Preview",
				cell: ({ row }) => (
					<div className="max-w-md">
						<p className="text-sm truncate">{row.original.messages[0]}</p>
						{row.original.messages.length > 1 ? (
							<p className="text-xs text-muted-foreground">
								+{row.original.messages.length - 1} more
							</p>
						) : null}
					</div>
				),
			},
			{
				accessorKey: "createdAt",
				header: "Created",
				cell: ({ row }) => {
					const createdAt = row.original.createdAt;

					return (
						<span className="text-muted-foreground tabular-nums">
							{createdAt
								? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
								: "—"}
						</span>
					);
				},
			},
			{
				id: "actions",
				header: "Actions",
				cell: ({ row }) => (
					<div className="flex items-center gap-1">
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
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				),
			},
		],
		[],
	);

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
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Message Templates</PageHeaderTitle>
					<PageHeaderDescription>
						Create reusable message templates with multiple variations
					</PageHeaderDescription>
				</PageHeaderContent>

				<PageHeaderActions>
					<Button
						onClick={() => setCreateDialogOpen(true)}
						disabled={!session?.user}
					>
						<Plus className="h-4 w-4" />
						Create Template
					</Button>
				</PageHeaderActions>
			</PageHeader>

			<DataTable
				columns={columns}
				data={templates}
				isLoading={isLoading}
				errorMessage={error?.message}
				pageIndex={page - 1}
				pageSize={pageSize}
				onPageIndexChange={(idx) => setPage(idx + 1)}
				onPageSizeChange={setPageSize}
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
