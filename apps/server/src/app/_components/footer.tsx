"use client";

import { ExternalLink, Github, Mail, Twitter } from "lucide-react";
import Link from "next/link";

export default function Footer() {
	const currentYear = new Date().getFullYear();

	return (
		<footer className="border-t bg-background mt-auto">
			<div className="container mx-auto px-4 py-8">
				<div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
					{/* Company Info */}
					<div className="space-y-4">
						<div>
							<h3 className="text-lg font-semibold">Live Boost</h3>
							<p className="text-sm text-muted-foreground mt-2">
								Deploy intelligent engagement bots to enhance meeting
								productivity and interaction across popular video platforms.
							</p>
						</div>
						<div className="flex space-x-4">
							<Link
								href="#"
								className="text-muted-foreground hover:text-foreground transition-colors"
								aria-label="GitHub"
							>
								<Github className="h-5 w-5" />
							</Link>
							<Link
								href="#"
								className="text-muted-foreground hover:text-foreground transition-colors"
								aria-label="Twitter"
							>
								<Twitter className="h-5 w-5" />
							</Link>
							<Link
								href="mailto:support@liveboost.com"
								className="text-muted-foreground hover:text-foreground transition-colors"
								aria-label="Email"
							>
								<Mail className="h-5 w-5" />
							</Link>
						</div>
					</div>

					{/* Product Links */}
					<div className="space-y-4">
						<h4 className="text-sm font-semibold">Product</h4>
						<ul className="space-y-2 text-sm">
							<li>
								<Link
									href="/docs"
									className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
								>
									Documentation <ExternalLink className="h-3 w-3" />
								</Link>
							</li>
							<li>
								<Link
									href="/usage"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Usage Dashboard
								</Link>
							</li>
							<li>
								<Link
									href="/api-keys"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									API Keys
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Pricing
								</Link>
							</li>
						</ul>
					</div>

					{/* Resources */}
					<div className="space-y-4">
						<h4 className="text-sm font-semibold">Resources</h4>
						<ul className="space-y-2 text-sm">
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Blog
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Tutorials
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Community
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Status
								</Link>
							</li>
						</ul>
					</div>

					{/* Support */}
					<div className="space-y-4">
						<h4 className="text-sm font-semibold">Support</h4>
						<ul className="space-y-2 text-sm">
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Help Center
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Contact Sales
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Support Tickets
								</Link>
							</li>
							<li>
								<Link
									href="#"
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									System Status
								</Link>
							</li>
						</ul>
					</div>
				</div>

				{/* Bottom Section */}
				<div className="mt-8 pt-8 border-t">
					<div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
						<div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-6 text-sm text-muted-foreground">
							<p>&copy; {currentYear} Live Boost. All rights reserved.</p>
							<div className="flex space-x-6">
								<Link
									href="#"
									className="hover:text-foreground transition-colors"
								>
									Privacy Policy
								</Link>
								<Link
									href="#"
									className="hover:text-foreground transition-colors"
								>
									Terms of Service
								</Link>
								<Link
									href="#"
									className="hover:text-foreground transition-colors"
								>
									Cookie Policy
								</Link>
							</div>
						</div>
						<div className="text-sm text-muted-foreground">
							Built with ❤️ for enhanced meeting engagement
						</div>
					</div>
				</div>
			</div>
		</footer>
	);
}
