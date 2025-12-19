"use client";

import {
	Activity,
	Bot,
	FileCode,
	FileText,
	Home,
	Key,
	LogIn,
	LogOut,
	Menu,
	Server,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const publicLinks = [
	{ title: "Dashboard", href: "/", icon: Home },
	{ title: "Docs", href: "/docs", icon: FileText },
];

const authenticatedLinks = [
	{ title: "Dashboard", href: "/", icon: Home },
	{ title: "Usage", href: "/usage", icon: Activity },
	{ title: "Bots", href: "/bots", icon: Bot },
	{ title: "Templates", href: "/templates", icon: FileCode },
	{ title: "API Keys", href: "/api-keys", icon: Key },
	{ title: "Pool", href: "/pool", icon: Server },
	{ title: "Docs", href: "/docs", icon: FileText },
];

interface MobileMenuProps {
	session: {
		user: {
			id: string;
			name: string;
			email: string;
			image?: string | null;
		};
	} | null;
	isLoggedIn: boolean;
}

export default function MobileMenu({ session, isLoggedIn }: MobileMenuProps) {
	const pathname = usePathname();
	const visibleLinks = isLoggedIn ? authenticatedLinks : publicLinks;

	return (
		<div className="md:hidden">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="icon" className="h-9 w-9">
						<Menu className="h-4 w-4" />
						<span className="sr-only">Open menu</span>
					</Button>
				</DropdownMenuTrigger>

				<DropdownMenuContent align="end" className="w-56">
					{session?.user ? (
						<>
							<DropdownMenuLabel className="font-normal">
								<div className="flex flex-col space-y-1">
									<p className="text-sm font-medium">{session.user.name}</p>
									<p className="text-xs text-muted-foreground truncate">
										{session.user.email}
									</p>
								</div>
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
						</>
					) : null}

					{visibleLinks.map((link) => {
						const isActive = pathname === link.href;
						const Icon = link.icon;

						return (
							<DropdownMenuItem key={link.href} asChild>
								<Link
									href={link.href}
									className={cn(
										"flex items-center gap-2 cursor-pointer",
										isActive && "bg-accent",
									)}
								>
									<Icon className="h-4 w-4" />
									{link.title}
								</Link>
							</DropdownMenuItem>
						);
					})}

					<DropdownMenuSeparator />

					{session?.user ? (
						<DropdownMenuItem
							className="cursor-pointer text-destructive focus:text-destructive"
							onClick={() => signOut()}
						>
							<LogOut className="h-4 w-4 mr-2" />
							Logout
						</DropdownMenuItem>
					) : (
						<DropdownMenuItem asChild>
							<Link
								href="/auth/sign-in"
								className="flex items-center gap-2 cursor-pointer"
							>
								<LogIn className="h-4 w-4" />
								Sign In
							</Link>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
