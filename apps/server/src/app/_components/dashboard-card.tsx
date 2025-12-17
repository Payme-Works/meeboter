import { ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardCardRootProps {
	children: ReactNode;
	className?: string;
}

function DashboardCardRoot({ children, className }: DashboardCardRootProps) {
	return (
		<Card
			className={cn(
				"flex h-full flex-col justify-between transition-colors hover:border-foreground/20",
				className,
			)}
		>
			{children}
		</Card>
	);
}

interface DashboardCardHeaderProps {
	children: ReactNode;
}

function DashboardCardHeader({ children }: DashboardCardHeaderProps) {
	return <CardHeader className="relative">{children}</CardHeader>;
}

interface DashboardCardTitleRowProps {
	children: ReactNode;
	icon?: ReactNode;
}

function DashboardCardTitleRow({ children, icon }: DashboardCardTitleRowProps) {
	return (
		<div className="flex items-center justify-between">
			<CardTitle>{children}</CardTitle>
			{icon && <div>{icon}</div>}
		</div>
	);
}

interface DashboardCardDescriptionProps {
	children: ReactNode;
}

function DashboardCardDescription({ children }: DashboardCardDescriptionProps) {
	return <CardDescription>{children}</CardDescription>;
}

interface DashboardCardContentProps {
	children: ReactNode;
}

function DashboardCardContent({ children }: DashboardCardContentProps) {
	return <CardContent>{children}</CardContent>;
}

interface DashboardCardLinkProps {
	href: string;
	external?: boolean;
	children: ReactNode;
}

function DashboardCardLink({
	href,
	external,
	children,
}: DashboardCardLinkProps) {
	return (
		<CardFooter className="mt-auto">
			<Link
				href={href}
				className="flex items-center"
				target={external ? "_blank" : undefined}
			>
				{children}
				{external ? (
					<ExternalLink className="ml-2 h-4 w-4" />
				) : (
					<ChevronRight className="ml-2 h-4 w-4" />
				)}
			</Link>
		</CardFooter>
	);
}

export const DashboardCard = {
	Root: DashboardCardRoot,
	Header: DashboardCardHeader,
	TitleRow: DashboardCardTitleRow,
	Description: DashboardCardDescription,
	Content: DashboardCardContent,
	Link: DashboardCardLink,
};
