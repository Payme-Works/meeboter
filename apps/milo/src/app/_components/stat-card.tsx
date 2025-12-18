import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCard({ children, className }: StatCardProps) {
	return (
		<div
			className={cn(
				"border bg-card p-4 flex flex-col h-full min-h-[148px]",
				className,
			)}
		>
			{children}
		</div>
	);
}

interface StatCardHeaderProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardHeader({ children, className }: StatCardHeaderProps) {
	return (
		<div className={cn("flex items-center justify-between mb-3", className)}>
			{children}
		</div>
	);
}

interface StatCardIconProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardIcon({ children, className }: StatCardIconProps) {
	return (
		<div
			className={cn(
				"h-10 w-10 bg-muted flex items-center justify-center text-muted-foreground",
				className,
			)}
		>
			{children}
		</div>
	);
}

interface StatCardLabelProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardLabel({ children, className }: StatCardLabelProps) {
	return (
		<span className={cn("text-xs text-muted-foreground", className)}>
			{children}
		</span>
	);
}

interface StatCardTitleProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardTitle({ children, className }: StatCardTitleProps) {
	return <h3 className={cn("font-semibold", className)}>{children}</h3>;
}

interface StatCardValueProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardValue({ children, className }: StatCardValueProps) {
	return (
		<div className={cn("text-3xl font-bold tabular-nums mb-1", className)}>
			{children}
		</div>
	);
}

interface StatCardContentProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardContent({ children, className }: StatCardContentProps) {
	return <div className={cn("flex-1 mb-3", className)}>{children}</div>;
}

interface StatCardDescriptionProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardDescription({
	children,
	className,
}: StatCardDescriptionProps) {
	return (
		<p className={cn("text-sm text-muted-foreground flex-1", className)}>
			{children}
		</p>
	);
}

interface StatCardFooterProps {
	children: React.ReactNode;
	className?: string;
}

export function StatCardFooter({ children, className }: StatCardFooterProps) {
	return (
		<div className={cn("mt-auto pt-3 border-t", className)}>{children}</div>
	);
}

interface StatCardLinkProps {
	href: string;
	external?: boolean;
	children: React.ReactNode;
	className?: string;
}

export function StatCardLink({
	href,
	external,
	children,
	className,
}: StatCardLinkProps) {
	return (
		<Link
			href={href}
			target={external ? "_blank" : undefined}
			className={cn(
				"text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors",
				className,
			)}
		>
			{children}
			<ChevronRight className="h-4 w-4" />
		</Link>
	);
}

// Skeleton components

interface SkeletonProps {
	className?: string;
}

export function StatCardIconSkeleton({ className }: SkeletonProps) {
	return <Skeleton className={cn("h-10 w-10", className)} />;
}

export function StatCardLabelSkeleton({ className }: SkeletonProps) {
	return <Skeleton className={cn("h-[14px] w-16", className)} />;
}

export function StatCardValueSkeleton({ className }: SkeletonProps) {
	return <Skeleton className={cn("h-9 w-16 mb-1", className)} />;
}

export function StatCardContentSkeleton({ className }: SkeletonProps) {
	return (
		<div className={cn("flex-1 mb-3 space-y-1.5", className)}>
			<Skeleton className="h-1.5 w-full" />
			<Skeleton className="h-[14px] w-24" />
		</div>
	);
}

export function StatCardLinkSkeleton({ className }: SkeletonProps) {
	return <Skeleton className={cn("h-[18px] w-20", className)} />;
}
