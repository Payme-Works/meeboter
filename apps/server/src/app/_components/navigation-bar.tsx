import Image from "next/image";
import Link from "next/link";
import NavLinks from "./nav-links";
import SessionButton from "./session-button";

interface NavigationBarProps {
	session: {
		user: {
			id: string;
			name: string;
			email: string;
			image?: string | null;
		};
	} | null;
}

export default function NavigationBar({ session }: NavigationBarProps) {
	const isLoggedIn = !!session?.user;

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

					{/* Navigation Links, client component for active state */}
					<NavLinks isLoggedIn={isLoggedIn} />

					{/* Session Button */}
					<SessionButton session={session} />
				</nav>
			</div>
		</header>
	);
}
