"use client";

import { Loader2, XCircle } from "lucide-react";
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

interface CancelDeploymentDialogProps {
	botId: number | null;
	botName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSuccess?: () => void;
}

export function CancelDeploymentDialog({
	botId,
	botName,
	open,
	onOpenChange,
	onSuccess,
}: CancelDeploymentDialogProps) {
	const utils = api.useUtils();

	const cancelDeployment = api.bots.cancelDeployment.useMutation({
		onSuccess: () => {
			void utils.bots.getBots.invalidate();
			onOpenChange(false);
			onSuccess?.();
		},
	});

	const handleCancel = () => {
		if (!botId) return;

		cancelDeployment.mutate({ id: String(botId) });
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<XCircle className="h-7 w-7 text-muted-foreground" />
					</div>
					<DialogTitle className="text-center">Cancel Deployment?</DialogTitle>
					<DialogDescription className="text-center pt-2">
						This will stop the deployment of{" "}
						<span className="font-semibold text-foreground">
							&quot;{botName}&quot;
						</span>{" "}
						before it joins the meeting.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={cancelDeployment.isPending}
					>
						Keep Deploying
					</Button>
					<Button
						variant="secondary"
						onClick={handleCancel}
						disabled={cancelDeployment.isPending}
					>
						{cancelDeployment.isPending ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								Cancelling...
							</>
						) : (
							"Cancel Deployment"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
