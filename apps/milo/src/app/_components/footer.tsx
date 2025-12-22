"use client";

import Link from "next/link";

export default function Footer() {
	const currentYear = new Date().getFullYear();

	return (
		<footer className="border-t border-border/50 mt-auto">
			<div className="container mx-auto px-4 py-6">
				<div className="flex flex-col md:flex-row items-center justify-between gap-4">
					{/* Brand */}
					<div className="flex items-center gap-6">
						<span className="text-sm font-medium">Meeboter</span>
						<span className="text-sm text-muted-foreground">
							&copy; {currentYear}
						</span>
					</div>

					{/* Links */}
					<div className="flex items-center gap-6 text-sm text-muted-foreground">
						<Link
							href="/docs"
							className="hover:text-foreground transition-colors"
						>
							Documentation
						</Link>
						<Link
							href="/api-keys"
							className="hover:text-foreground transition-colors"
						>
							API Keys
						</Link>
						<Link
							href="/infrastructure"
							className="hover:text-foreground transition-colors"
						>
							Infrastructure
						</Link>
						<Link
							href="/usage"
							className="hover:text-foreground transition-colors"
						>
							Usage
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
