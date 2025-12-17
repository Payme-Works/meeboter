"use client";

import { ChevronRight, File, Key, LogIn } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import { QuickBotJoin, QuickBotJoinSkeleton } from "./quick-bot-join";
import { RecentBots, RecentBotsSkeleton } from "./recent-bots";
import SubscriptionPlansSection from "./subscription-plans-section";

function SecondaryCardSkeleton() {
	return (
		<div className="border bg-card p-4 h-full flex flex-col">
			<div className="flex items-center gap-3 mb-3">
				<Skeleton className="h-10 w-10 shrink-0" />
				<Skeleton className="h-5 w-24" />
			</div>
			<Skeleton className="h-4 w-full mb-2" />
			<Skeleton className="h-4 w-3/4 mb-4" />
			<div className="mt-auto">
				<Skeleton className="h-4 w-20" />
			</div>
		</div>
	);
}

interface SecondaryCardProps {
	icon: React.ReactNode;
	title: string;
	description: React.ReactNode;
	href: string;
	linkText: string;
	external?: boolean;
}

function SecondaryCard({
	icon,
	title,
	description,
	href,
	linkText,
	external,
}: SecondaryCardProps) {
	return (
		<div className="border bg-card p-4 h-full flex flex-col">
			<div className="flex items-center gap-3 mb-3">
				<div className="h-10 w-10 bg-muted flex items-center justify-center text-muted-foreground shrink-0">
					{icon}
				</div>
				<h3 className="font-semibold">{title}</h3>
			</div>

			<p className="text-sm text-muted-foreground flex-1">{description}</p>

			<div className="mt-4">
				<Link
					href={href}
					target={external ? "_blank" : undefined}
					className="text-sm text-foreground hover:text-accent flex items-center gap-1 transition-colors"
				>
					{linkText}
					<ChevronRight className="h-4 w-4" />
				</Link>
			</div>
		</div>
	);
}

function LoggedOutHero() {
	return (
		<div className="border bg-card">
			<div className="p-8 text-center">
				<div className="max-w-lg mx-auto">
					<h2 className="text-2xl font-bold mb-3">
						Deploy Engagement Bots to Your Meetings
					</h2>
					<p className="text-muted-foreground mb-6">
						Instantly add intelligent bots to Google Meet, Microsoft Teams, or
						Zoom. Boost engagement, capture recordings, and analyze meeting
						interactions.
					</p>
					<div className="flex items-center justify-center gap-3">
						<Link href="/auth/sign-up">
							<Button size="lg">
								Get Started Free
								<LogIn className="h-4 w-4" />
							</Button>
						</Link>
						<Link href="/auth/sign-in">
							<Button variant="outline" size="lg">
								Sign In
							</Button>
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}

function ActiveKeyCount() {
	const { data: keyCount, isLoading } = api.apiKeys.getApiKeyCount.useQuery();

	if (isLoading) {
		return <Skeleton className="h-4 w-8 inline-block" />;
	}

	return (
		<span className="text-accent font-medium">{keyCount?.count ?? 0}</span>
	);
}

export default function WelcomeDashboard() {
	const { data: session } = useSession();
	const isLoggedIn = !!session?.user;

	return (
		<div className="space-y-8">
			<div>
				<h1 className="text-3xl font-bold tracking-tight">
					{isLoggedIn
						? `Welcome back${session?.user?.name ? `, ${session.user.name}` : ""}`
						: "Welcome to Meeboter"}
				</h1>
				<p className="mt-2 text-muted-foreground">
					Deploy intelligent bots to boost engagement and productivity in your
					meetings.
				</p>
			</div>

			{isLoggedIn ? <QuickBotJoin /> : <LoggedOutHero />}

			{isLoggedIn && (
				<div className="grid gap-6 lg:grid-cols-3">
					<div className="lg:col-span-2">
						<RecentBots />
					</div>

					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
						<SecondaryCard
							icon={<Key className="h-5 w-5" />}
							title="API Keys"
							description={
								<>
									You have <ActiveKeyCount /> active API keys for programmatic
									bot deployment.
								</>
							}
							href="/api-keys"
							linkText="Manage Keys"
						/>

						<SecondaryCard
							icon={<File className="h-5 w-5" />}
							title="Documentation"
							description="Learn how to integrate bots, access recordings, and configure interactions."
							href="/docs"
							linkText="View Docs"
							external
						/>
					</div>
				</div>
			)}

			<SubscriptionPlansSection />
		</div>
	);
}

export function WelcomeDashboardSkeleton() {
	return (
		<div className="space-y-8">
			<div>
				<Skeleton className="h-9 w-72" />
				<Skeleton className="mt-2 h-5 w-96" />
			</div>

			<QuickBotJoinSkeleton />

			<div className="grid gap-6 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<RecentBotsSkeleton />
				</div>

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
					<SecondaryCardSkeleton />
					<SecondaryCardSkeleton />
				</div>
			</div>
		</div>
	);
}
