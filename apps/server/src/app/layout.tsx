import "./globals.css";

import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
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
					<SessionProvider>
						<div className="flex h-full w-full flex-col items-center gap-4 justify-center">
							<NavigationBar />

							<div className="container h-full px-4">{children}</div>
						</div>
					</SessionProvider>
				</TRPCReactProvider>
			</body>
		</html>
	);
}
