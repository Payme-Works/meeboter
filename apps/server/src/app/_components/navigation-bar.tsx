"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import SessionButton from "./session-button";

const publicLinks = [
	{ title: "Dashboard", href: "/" },
	{ title: "Docs", href: "/docs" },
];

const authenticatedLinks = [
	{ title: "API Keys", href: "/api-keys" },
	{ title: "Bots", href: "/bots" },
	{ title: "Templates", href: "/templates" },
	{ title: "Usage", href: "/usage" },
];

export default function NavigationBar() {
	const { data: session } = useSession();
	const pathname = usePathname();

	const visibleLinks = session?.user
		? [...publicLinks, ...authenticatedLinks]
		: publicLinks;

	return (
		<header className="border-b border-border/50">
			<div className="container mx-auto px-4">
				<nav className="flex items-center justify-between h-16">
					{/* Logo + Wordmark */}
					<Link
						href="/"
						className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
					>
						<Image src="/logo.svg" alt="Meeboter" width={28} height={28} />
						<span className="text-lg font-semibold tracking-tight">
							Meeboter
						</span>
					</Link>

					{/* Navigation Links */}
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
									{isActive && (
										<span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent" />
									)}
								</Link>
							);
						})}
					</div>

					{/* Session Button */}
					<SessionButton />
				</nav>
			</div>
		</header>
	);
}
