import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			data-testid="skeleton"
			className={cn("bg-muted animate-pulse", className)}
			{...props}
		/>
	);
}

export { Skeleton };
