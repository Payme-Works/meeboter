import Image from "next/image";
import Link from "next/link";
import MobileMenu from "./mobile-menu";
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
				<nav className="flex items-center justify-between h-16 md:h-20">
					{/* Logo + Wordmark */}
					<Link
						href="/"
						className="flex items-center gap-2 md:gap-2.5 transition-opacity hover:opacity-80"
					>
						<Image
							src="/logo.svg"
							alt="Meeboter"
							width={24}
							height={24}
							className="md:w-7 md:h-7"
						/>
						<span className="text-base md:text-lg font-semibold tracking-tight">
							Meeboter
						</span>
					</Link>

					{/* Desktop Navigation Links */}
					<NavLinks isLoggedIn={isLoggedIn} />

					{/* Desktop Session Button + Mobile Menu */}
					<div className="flex items-center gap-2">
						<div className="hidden md:block">
							<SessionButton session={session} />
						</div>
						<MobileMenu session={session} isLoggedIn={isLoggedIn} />
					</div>
				</nav>
			</div>
		</header>
	);
}
