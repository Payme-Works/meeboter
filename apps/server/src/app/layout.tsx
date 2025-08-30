import "./globals.css";

import type { Metadata } from "next";
import { TRPCReactProvider } from "@/trpc/react";
import NavigationBar from "./_components/navigation-bar";

export const metadata: Metadata = {
	title: "Live Boost",
	description:
		"A user-friendly interface for managing and scheduling meetings effortlessly.",
	icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en">
			<body>
				<TRPCReactProvider>
					<div className="flex flex-col min-h-screen space-y-4">
						<NavigationBar />

						{children}
					</div>
				</TRPCReactProvider>
			</body>
		</html>
	);
}
