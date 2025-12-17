import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Meeboter Example Application",
	description:
		"A user-friendly interface for scheduling meetings effortlessly.",
	icons: [{ rel: "icon", url: "/logo.svg" }],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${GeistSans.variable}`}>
			<body className={`antialiased`}>{children}</body>
		</html>
	);
}
