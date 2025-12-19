"use client";

import { AlertTriangle, Loader2, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/trpc/react";

interface RemoveFromCallDialogProps {
	botId: number | null;
	botName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: () => void;
}

export function RemoveFromCallDialog({
	botId,
	botName,
	open,
	onOpenChange,
	onSuccess,
}: RemoveFromCallDialogProps) {
	const utils = api.useUtils();

	const removeFromCall = api.bots.removeFromCall.useMutation({
		onSuccess: () => {
			void utils.bots.getBots.invalidate();
			onOpenChange(false);
			onSuccess?.();
		},
	});

	const handleRemove = () => {
		if (!botId) return;

		removeFromCall.mutate({ id: String(botId) });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Remove Bot from Call?</DialogTitle>
					<DialogDescription className="space-y-3 pt-2">
						<span className="block">
							This will disconnect{" "}
							<span className="font-semibold text-foreground">
								&quot;{botName}&quot;
							</span>{" "}
							from the meeting.
						</span>
						<span className="block">
							Any ongoing recording will be stopped.
						</span>
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
					<AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
					<p className="text-sm text-amber-800 dark:text-amber-200">
						This action cannot be undone. The bot will need to be redeployed to
						rejoin the call.
					</p>
				</div>

				<DialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={removeFromCall.isPending}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleRemove}
						disabled={removeFromCall.isPending}
					>
						{removeFromCall.isPending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Removing...
							</>
						) : (
							<>
								<PhoneOff className="h-4 w-4" />
								Remove from Call
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
