import "./globals.css";

import type { Metadata } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

import { auth } from "@/server/auth";
import { TRPCReactProvider } from "@/trpc/react";
import Footer from "./_components/footer";
import NavigationBar from "./_components/navigation-bar";

const satoshi = localFont({
	src: "./fonts/Satoshi-Variable.woff2",
	display: "swap",
	variable: "--font-satoshi",
});

export const metadata: Metadata = {
	title: "Meeboter",
	description:
		"Deploy intelligent bots to boost engagement and participation across video meetings.",
	icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await auth.api.getSession({ headers: await headers() });

	return (
		<html lang="en" className={satoshi.variable}>
			<body>
				<NuqsAdapter>
					<TRPCReactProvider>
						<div className="flex flex-col min-h-screen">
							<NavigationBar session={session} />

							<main className="grow space-y-4 pt-10 pb-20">{children}</main>

							<Footer />
						</div>
						<Toaster position="bottom-right" richColors closeButton />
					</TRPCReactProvider>
				</NuqsAdapter>
			</body>
		</html>
	);
}
