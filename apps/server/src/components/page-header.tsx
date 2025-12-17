import type { ReactNode } from "react";

interface PageHeaderProps {
	children: ReactNode;
}

export function PageHeader({ children }: PageHeaderProps) {
	return <div className="flex items-end justify-between gap-4">{children}</div>;
}

interface PageHeaderContentProps {
	children: ReactNode;
}

export function PageHeaderContent({ children }: PageHeaderContentProps) {
	return <div className="space-y-1">{children}</div>;
}

interface PageHeaderTitleProps {
	children: ReactNode;
}

export function PageHeaderTitle({ children }: PageHeaderTitleProps) {
	return <h1 className="text-2xl font-bold tracking-tight">{children}</h1>;
}

interface PageHeaderDescriptionProps {
	children: ReactNode;
}

export function PageHeaderDescription({
	children,
}: PageHeaderDescriptionProps) {
	return <p className="text-muted-foreground">{children}</p>;
}

interface PageHeaderActionsProps {
	children: ReactNode;
}

export function PageHeaderActions({ children }: PageHeaderActionsProps) {
	return <div className="flex items-center gap-2 shrink-0">{children}</div>;
}
