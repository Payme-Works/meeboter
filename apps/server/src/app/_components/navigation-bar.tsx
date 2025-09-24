"use client";

import Image from "next/image";
import Link from "next/link";
import type * as React from "react";

import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuLink,
	NavigationMenuList,
	navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { useSession } from "@/lib/auth-client";
import SessionButton from "./session-button";

const publicComponents: {
	title: string | React.ReactNode;
	href: string;
	target: string;
}[] = [
	{
		title: "Dashboard",
		href: "/",
		target: "_self",
	},
	{
		title: "Docs",
		href: "/docs",
		target: "_self",
	},
];

const authenticatedComponents: {
	title: string | React.ReactNode;
	href: string;
	target: string;
}[] = [
	{
		title: "API Keys",
		href: "/api-keys",
		target: "_self",
	},
	{
		title: "Bots",
		href: "/bots",
		target: "_self",
	},
	{
		title: "Templates",
		href: "/templates",
		target: "_self",
	},
	{
		title: "Usage",
		href: "/usage",
		target: "_self",
	},
];

export default function NavigationBar() {
	const { data: session } = useSession();

	// Combine public components with authenticated components if user is signed in
	const visibleComponents = session?.user
		? [...publicComponents, ...authenticatedComponents]
		: publicComponents;

	return (
		<div className="flex w-full flex-row items-center container mx-auto justify-between py-8 px-4">
			<NavigationMenu className="flex-1 flex items-center gap-4">
				<Image src="/logo.svg" alt="Logo" width={32} height={32} />

				<NavigationMenuList className="flex-wrap justify-start md:justify-center">
					{visibleComponents.map((component) => (
						<NavigationMenuItem key={component.href}>
							<NavigationMenuLink
								className={navigationMenuTriggerStyle()}
								asChild
								target={component.target}
							>
								<Link href={component.href}>{component.title}</Link>
							</NavigationMenuLink>
						</NavigationMenuItem>
					))}
				</NavigationMenuList>
			</NavigationMenu>

			<div className="flex items-center">
				<SessionButton />
			</div>
		</div>
	);
}
