"use client";

import { Loader2 } from "lucide-react";
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
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSuccess?: () => void;
}

export function CancelDeploymentDialog({
	botId,
	botName,
	isOpen,
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
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Cancel Deployment?</DialogTitle>
					<DialogDescription className="pt-2">
						This will stop the deployment of{" "}
						<span className="font-semibold text-foreground">
							&quot;{botName}&quot;
						</span>{" "}
						before it joins the meeting.
					</DialogDescription>
				</DialogHeader>

				<DialogFooter className="gap-2">
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
