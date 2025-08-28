import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface DashboardCardProps {
	title?: string | React.ReactNode;
	description?: string | React.ReactNode;
	content?: string | React.ReactNode;
	icon?: React.ReactNode;
	link?:
		| {
				type: "EXTERNAL" | "INTERNAL";
				url: string;
				text: string;
		  }
		| {
				type: "CUSTOM";
				component: React.ReactNode;
		  };
	className?: string;
}

export default function DashboardCard({
	title,
	description,
	content,
	icon,
	link,
	className,
}: DashboardCardProps) {
	return (
		<Card className={`flex h-full flex-col justify-between ${className}`}>
			{!!title || !!description || !!icon ? (
				<CardHeader className="relative">
					<div className="flex items-center justify-between">
						{!!title && typeof title === "string" ? (
							<CardTitle>{title}</CardTitle>
						) : (
							title
						)}

						{icon ? <div>{icon}</div> : null}
					</div>

					{!!description && typeof description === "string" ? (
						<CardDescription>{description}</CardDescription>
					) : (
						description
					)}
				</CardHeader>
			) : null}

			{content ? <CardContent>{content}</CardContent> : null}

			{link ? (
				<CardFooter className="mt-auto">
					{link.type === "CUSTOM" ? (
						link.component
					) : (
						<Link href={link.url} className="flex items-center">
							{link.text}

							{link.type === "EXTERNAL" ? (
								<ExternalLink className="ml-2 h-4 w-4" />
							) : (
								<ChevronRight className="ml-2 h-4 w-4" />
							)}
						</Link>
					)}
				</CardFooter>
			) : null}
		</Card>
	);
}
