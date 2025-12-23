"use client";

import { Eye, MoreHorizontal, PhoneOff, Video, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BotActionsDropdownProps {
	botId: number;
	botName: string;
	status: string;
	recording: string | null;
	onView: () => void;
	onRemoveFromCall: () => void;
	onCancelDeployment: () => void;
}

const ACTIVE_CALL_STATUSES = ["IN_WAITING_ROOM", "IN_CALL", "RECORDING"];

export function BotActionsDropdown({
	botId,
	botName,
	status,
	recording,
	onView,
	onRemoveFromCall,
	onCancelDeployment,
}: BotActionsDropdownProps) {
	const isInActiveCall = ACTIVE_CALL_STATUSES.includes(status);
	const isDeploying = status === "DEPLOYING";
	const hasRecording = Boolean(recording);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8 hover:bg-muted/80 hover:text-foreground data-[state=open]:bg-muted"
				>
					<MoreHorizontal className="h-4 w-4" />
					<span className="sr-only">Open menu for {botName}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					Bot #{botId}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />

				<DropdownMenuItem onClick={onView}>
					<Eye className="h-4 w-4" />
					View details
				</DropdownMenuItem>

				{hasRecording ? (
					<DropdownMenuItem asChild>
						<a
							href={recording ?? "#"}
							target="_blank"
							rel="noopener noreferrer"
						>
							<Video className="h-4 w-4" />
							View recording
						</a>
					</DropdownMenuItem>
				) : null}

				{isInActiveCall || isDeploying ? (
					<>
						<DropdownMenuSeparator />
						{isInActiveCall ? (
							<DropdownMenuItem
								variant="destructive"
								onClick={onRemoveFromCall}
							>
								<PhoneOff className="h-4 w-4" />
								Remove from call
							</DropdownMenuItem>
						) : null}
						{isDeploying ? (
							<DropdownMenuItem onClick={onCancelDeployment}>
								<XCircle className="h-4 w-4" />
								Cancel deployment
							</DropdownMenuItem>
						) : null}
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
