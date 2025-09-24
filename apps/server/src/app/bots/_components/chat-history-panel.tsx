"use client";

import { format } from "date-fns";
import {
	AlertCircle,
	Bot,
	CheckCircle,
	Clock,
	MessageSquare,
	User,
	XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";

interface ChatHistoryPanelProps {
	botId: number;
}

const getStatusIcon = (status: string) => {
	switch (status) {
		case "sent":
			return <CheckCircle className="h-3 w-3 text-green-500" />;
		case "failed":
			return <XCircle className="h-3 w-3 text-red-500" />;
		case "pending":
		case "queued":
			return <Clock className="h-3 w-3 text-yellow-500" />;
		default:
			return <AlertCircle className="h-3 w-3 text-gray-500" />;
	}
};

const getStatusColor = (status: string) => {
	switch (status) {
		case "sent":
			return "bg-green-100 text-green-800";
		case "failed":
			return "bg-red-100 text-red-800";
		case "pending":
		case "queued":
			return "bg-yellow-100 text-yellow-800";
		default:
			return "bg-gray-100 text-gray-800";
	}
};

export function ChatHistoryPanel({ botId }: ChatHistoryPanelProps) {
	const {
		data: messages = [],
		isLoading,
		error,
	} = api.chat.getChatHistoryForBot.useQuery({ botId: botId.toString() });

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4" />
					<h3 className="font-semibold">Chat History</h3>
				</div>
				<div className="space-y-2">
					{Array.from({ length: 3 }, (_, index) => (
						<div
							key={`skeleton-loading-${Math.random()}-${index}`}
							className="border rounded-lg p-3"
						>
							<div className="flex items-center justify-between mb-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-4 w-16" />
							</div>
							<Skeleton className="h-4 w-full" />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4" />
					<h3 className="font-semibold">Chat History</h3>
				</div>
				<div className="text-center py-8 text-muted-foreground">
					<XCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
					<p>Failed to load chat history</p>
					<p className="text-sm">{error.message}</p>
				</div>
			</div>
		);
	}

	if (messages.length === 0) {
		return (
			<div className="space-y-4">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4" />
					<h3 className="font-semibold">Chat History</h3>
				</div>
				<div className="text-center py-8 text-muted-foreground">
					<MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
					<p>No chat messages yet</p>
					<p className="text-sm">Messages sent to this bot will appear here</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<MessageSquare className="h-4 w-4" />
				<h3 className="font-semibold">Chat History</h3>
				<Badge variant="secondary" className="ml-auto">
					{messages.length} message{messages.length !== 1 ? "s" : ""}
				</Badge>
			</div>

			<ScrollArea className="h-64 w-full border rounded-lg">
				<div className="p-4 space-y-3">
					{messages.map((message) => (
						<div
							key={message.id}
							className="border-l-2 border-l-blue-200 pl-3 py-2"
						>
							<div className="flex items-center justify-between mb-1">
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<User className="h-3 w-3" />
									<span>User Message</span>
								</div>
								<div className="flex items-center gap-2">
									<Badge
										variant="outline"
										className={getStatusColor(message.status)}
									>
										<div className="flex items-center gap-1">
											{getStatusIcon(message.status)}
											<span className="capitalize">{message.status}</span>
										</div>
									</Badge>
									<span className="text-xs text-muted-foreground">
										{format(new Date(message.sentAt), "MMM d, HH:mm")}
									</span>
								</div>
							</div>

							<div className="text-sm bg-muted p-2 rounded-md">
								{message.messageText}
							</div>

							{message.templateId && (
								<div className="text-xs text-muted-foreground mt-1">
									<span className="inline-flex items-center gap-1">
										<Bot className="h-3 w-3" />
										From template (randomized)
									</span>
								</div>
							)}

							{message.error && (
								<div className="text-xs text-red-600 mt-1 bg-red-50 p-1 rounded">
									Error: {message.error}
								</div>
							)}
						</div>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}
