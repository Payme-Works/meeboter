"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, MessageSquare, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { DataTable } from "@/components/custom/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import { BotDetailsDialog } from "./_components/bot-details-dialog";
import { MultiBotChatDialog } from "./_components/multi-bot-chat-dialog";
import { MultiBotJoinDialog } from "./_components/multi-bot-join-dialog";

export default function BotsPage() {
	const [selectedBot, setSelectedBot] = useState<number | null>(null);
	const [multiBotDialogOpen, setMultiBotDialogOpen] = useState(false);
	const [multiBotChatDialogOpen, setMultiBotChatDialogOpen] = useState(false);

	const { data: session } = useSession();

	const { data: bots = [], isLoading, error } = api.bots.getBots.useQuery();

	type Bot = (typeof bots)[number];

	const columns: ColumnDef<Bot>[] = [
		{
			accessorKey: "meetingInfo.platform",
			header: "Platform",
			cell: ({ row }) => {
				const platform = row.original.meetingInfo.platform;

				return (
					<div className="flex items-center gap-2">
						{typeof platform === "string" && (
							<Image
								src={`/platform-logos/${platform}.svg`}
								alt={`${typeof platform === "string" ? platform : "Unknown"} logo`}
								width={20}
								height={20}
							/>
						)}
						{typeof platform === "string"
							? platform.charAt(0).toUpperCase() + platform.slice(1)
							: "Unknown"}
					</div>
				);
			},
		},
		{
			accessorKey: "recording",
			header: "Recording Length",
			cell: ({ row }) => {
				const recording = row.original.recording;

				return recording ? (
					<Link href={recording} target="_blank">
						{recording} <ExternalLinkIcon className="h-4 w-4" />
					</Link>
				) : (
					"No Recording Available"
				);
			},
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ row }) => {
				const status = row.original.status;

				return (
					<Badge variant="outline" className="bg-gray-100 text-gray-800">
						{status}
					</Badge>
				);
			},
		},
		{
			accessorKey: "createdAt",
			header: "Created At",
			cell: ({ row }) => {
				const createdAt = row.original.createdAt;

				const timeAgo = createdAt
					? formatDistanceToNow(new Date(createdAt), {
							addSuffix: true,
						})
					: "No date available";

				return `${timeAgo}`;
			},
		},
		{
			id: "actions",
			cell: ({ row }) => {
				return (
					<Button
						variant="outline"
						onClick={() => setSelectedBot(row.original.id)}
					>
						View Details
					</Button>
				);
			},
		},
	];

	return (
		<div className="mx-auto container space-y-4 px-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">Bots</h2>
					<p className="text-muted-foreground">
						View and manage bots that have been created.
					</p>
				</div>

				<div className="flex gap-2">
					<Button
						variant="outline"
						onClick={() => setMultiBotChatDialogOpen(true)}
						disabled={!session?.user}
					>
						<MessageSquare className="h-4 w-4 mr-2" />
						Multi-Bot Chat
					</Button>
					<Button
						onClick={() => setMultiBotDialogOpen(true)}
						disabled={!session?.user}
					>
						<Plus className="h-4 w-4 mr-2" />
						Join Multiple Bots
					</Button>
				</div>
			</div>

			<DataTable
				columns={columns}
				data={bots}
				isLoading={isLoading}
				errorMessage={error?.message}
			/>

			<BotDetailsDialog
				botId={selectedBot}
				onClose={() => setSelectedBot(null)}
			/>

			<MultiBotJoinDialog
				open={multiBotDialogOpen}
				onClose={() => setMultiBotDialogOpen(false)}
			/>

			<MultiBotChatDialog
				open={multiBotChatDialogOpen}
				onClose={() => setMultiBotChatDialogOpen(false)}
				bots={bots}
			/>
		</div>
	);
}
