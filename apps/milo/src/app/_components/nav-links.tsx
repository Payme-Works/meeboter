"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const publicLinks = [
	{ title: "Dashboard", href: "/" },
	{ title: "Docs", href: "/docs" },
];

const authenticatedLinks = [
	{ title: "Dashboard", href: "/" },
	{ title: "Usage", href: "/usage" },
	{ title: "Bots", href: "/bots" },
	{ title: "Templates", href: "/templates" },
	{ title: "API Keys", href: "/api-keys" },
	{ title: "Infrastructure", href: "/infrastructure" },
	{ title: "Docs", href: "/docs" },
];

interface NavLinksProps {
	isLoggedIn: boolean;
}

export default function NavLinks({ isLoggedIn }: NavLinksProps) {
	const pathname = usePathname();

	const visibleLinks = isLoggedIn ? authenticatedLinks : publicLinks;

	return (
		<div className="hidden md:flex items-center gap-1">
			{visibleLinks.map((link) => {
				const isActive = pathname === link.href;

				return (
					<Link
						key={link.href}
						href={link.href}
						className={cn(
							"px-3 py-2 text-sm font-medium transition-colors relative",
							isActive
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{link.title}
						{isActive ? (
							<span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent" />
						) : null}
					</Link>
				);
			})}
		</div>
	);
}
