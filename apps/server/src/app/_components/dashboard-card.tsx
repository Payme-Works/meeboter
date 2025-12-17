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

interface DashboardCardProps {
	children: ReactNode;
	className?: string;
}

export function DashboardCard({ children, className }: DashboardCardProps) {
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

export function DashboardCardHeader({ children }: DashboardCardHeaderProps) {
	return <CardHeader className="relative">{children}</CardHeader>;
}

interface DashboardCardTitleRowProps {
	children: ReactNode;
	icon?: ReactNode;
}

export function DashboardCardTitleRow({
	children,
	icon,
}: DashboardCardTitleRowProps) {
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

export function DashboardCardDescription({
	children,
}: DashboardCardDescriptionProps) {
	return <CardDescription>{children}</CardDescription>;
}

interface DashboardCardContentProps {
	children: ReactNode;
}

export function DashboardCardContent({ children }: DashboardCardContentProps) {
	return <CardContent>{children}</CardContent>;
}

interface DashboardCardLinkProps {
	href: string;
	external?: boolean;
	children: ReactNode;
}

export function DashboardCardLink({
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
