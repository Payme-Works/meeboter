import "./globals.css";

import type { Metadata } from "next";
import { TRPCReactProvider } from "@/trpc/react";
import Footer from "./_components/footer";
import NavigationBar from "./_components/navigation-bar";

export const metadata: Metadata = {
	title: "Live Boost",
	description:
		"Deploy intelligent engagement bots to enhance meeting productivity and interaction across popular video platforms.",
	icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<TRPCReactProvider>
					<div className="flex flex-col min-h-screen">
						<NavigationBar />

						<main className="flex-grow space-y-4 pt-6 pb-20">{children}</main>

						<Footer />
					</div>
				</TRPCReactProvider>
			</body>
		</html>
	);
}
