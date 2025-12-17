import { Activity, Bot, File, Key, LogIn } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import {
	QuickBotJoin,
	QuickBotJoinSkeleton,
} from "./_components/quick-bot-join";
import { RecentBots, RecentBotsSkeleton } from "./_components/recent-bots";
import {
	StatCard,
	StatCardContent,
	StatCardContentSkeleton,
	StatCardDescription,
	StatCardFooter,
	StatCardHeader,
	StatCardIcon,
	StatCardIconSkeleton,
	StatCardLabel,
	StatCardLabelSkeleton,
	StatCardLink,
	StatCardLinkSkeleton,
	StatCardTitle,
	StatCardValue,
	StatCardValueSkeleton,
} from "./_components/stat-card";
import SubscriptionPlansSection from "./_components/subscription-plans-section";

// ─── Server Components ──────────────────────────────────────────

function DashboardHeader({ userName }: { userName?: string | null }) {
	return (
		<div className="mb-8">
			<h1 className="text-3xl font-bold tracking-tight">
				Welcome back{userName ? `, ${userName}` : ""}
			</h1>
			<p className="mt-2 text-muted-foreground">
				Deploy intelligent bots to boost engagement and productivity in your
				meetings.
			</p>
		</div>
	);
}

function WelcomeHeader() {
	return (
		<div className="mb-8">
			<h1 className="text-3xl font-bold tracking-tight">Welcome to Meeboter</h1>
			<p className="mt-2 text-muted-foreground">
				Deploy intelligent bots to boost engagement and productivity in your
				meetings.
			</p>
		</div>
	);
}

function LoggedOutHero() {
	return (
		<div className="border bg-card mb-8">
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

function DocsCard() {
	return (
		<StatCard>
			<StatCardHeader>
				<StatCardIcon>
					<File className="h-5 w-5" />
				</StatCardIcon>
				<StatCardLabel>Resources</StatCardLabel>
			</StatCardHeader>
			<StatCardValue>Docs</StatCardValue>
			<StatCardContent>
				<p className="text-sm text-muted-foreground">
					Learn how to integrate bots and configure interactions.
				</p>
			</StatCardContent>
			<StatCardFooter>
				<StatCardLink href="/docs">View Docs</StatCardLink>
			</StatCardFooter>
		</StatCard>
	);
}

// ─── Async Server Components, Data Fetching ─────────────────────

async function StatCardsSection({ timeZone }: { timeZone: string }) {
	const [activeBots, keys, usage] = await Promise.all([
		api.bots.getActiveBotCount(),
		api.apiKeys.getApiKeyCount(),
		api.bots.getDailyUsage({ timeZone }),
	]);

	const usageValue = usage.usage ?? 0;
	const limit = usage.limit;
	const isUnlimited = limit === null;

	const usagePercentage =
		limit && usageValue ? Math.min((usageValue / limit) * 100, 100) : 0;

	return (
		<div className="grid gap-4">
			<div className="grid grid-cols-2 gap-4">
				{/* Active Bots Card */}
				<StatCard>
					<StatCardHeader>
						<StatCardIcon>
							<Bot className="h-5 w-5" />
						</StatCardIcon>
						<StatCardLabel>Active Bots</StatCardLabel>
					</StatCardHeader>
					<StatCardValue>{activeBots.count ?? 0}</StatCardValue>
					<StatCardFooter>
						<StatCardLink href="/bots">View Bots</StatCardLink>
					</StatCardFooter>
				</StatCard>

				{/* API Keys Card */}
				<StatCard>
					<StatCardHeader>
						<StatCardIcon>
							<Key className="h-5 w-5" />
						</StatCardIcon>
						<StatCardLabel>API Keys</StatCardLabel>
					</StatCardHeader>
					<StatCardValue>{keys.count ?? 0}</StatCardValue>
					<StatCardFooter>
						<StatCardLink href="/api-keys">Manage Keys</StatCardLink>
					</StatCardFooter>
				</StatCard>
			</div>

			{/* Today's Usage Card */}
			<StatCard>
				<StatCardHeader>
					<StatCardIcon>
						<Activity className="h-5 w-5" />
					</StatCardIcon>
					<StatCardLabel>Today's Usage</StatCardLabel>
				</StatCardHeader>
				<StatCardValue>
					{usageValue}
					<span className="text-lg text-muted-foreground font-normal ml-1">
						/{isUnlimited ? "∞" : limit}
					</span>
				</StatCardValue>
				{!isUnlimited ? (
					<StatCardContent>
						<div className="space-y-1">
							<Progress value={usagePercentage} className="h-1.5" />
							<p className="text-xs text-muted-foreground">
								{Math.round(usagePercentage)}% of daily limit
							</p>
						</div>
					</StatCardContent>
				) : null}
				<StatCardFooter>
					<StatCardLink href="/usage">View Usage</StatCardLink>
				</StatCardFooter>
			</StatCard>

			<DocsCard />
		</div>
	);
}

async function RecentBotsWithPrefetch() {
	await api.bots.getBots.prefetch();

	return <RecentBots />;
}

// ─── Skeleton Components ────────────────────────────────────────

function StatCardsSkeleton() {
	return (
		<div className="grid gap-4">
			<div className="grid grid-cols-2 gap-4">
				<StatCard>
					<StatCardHeader>
						<StatCardIconSkeleton />
						<StatCardLabelSkeleton />
					</StatCardHeader>
					<StatCardValueSkeleton />
					<StatCardFooter>
						<StatCardLinkSkeleton />
					</StatCardFooter>
				</StatCard>
				<StatCard>
					<StatCardHeader>
						<StatCardIconSkeleton />
						<StatCardLabelSkeleton />
					</StatCardHeader>
					<StatCardValueSkeleton />
					<StatCardFooter>
						<StatCardLinkSkeleton />
					</StatCardFooter>
				</StatCard>
			</div>
			<StatCard>
				<StatCardHeader>
					<StatCardIconSkeleton />
					<StatCardLabelSkeleton />
				</StatCardHeader>
				<StatCardValueSkeleton />
				<StatCardContentSkeleton />
				<StatCardFooter>
					<StatCardLinkSkeleton />
				</StatCardFooter>
			</StatCard>
			<StatCard>
				<StatCardHeader>
					<StatCardIconSkeleton />
					<StatCardLabelSkeleton />
				</StatCardHeader>
				<StatCardValueSkeleton />
				<StatCardContentSkeleton />
				<StatCardFooter>
					<StatCardLinkSkeleton />
				</StatCardFooter>
			</StatCard>
		</div>
	);
}

function ResourceCardsSkeleton() {
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
			<StatCard className="min-h-[180px]">
				<StatCardHeader className="justify-start gap-3">
					<StatCardIconSkeleton />
					<Skeleton className="h-5 w-20" />
				</StatCardHeader>
				<Skeleton className="h-4 w-full mb-1" />
				<Skeleton className="h-4 w-3/4 flex-1" />
				<StatCardFooter className="border-t-0 pt-0 mt-4">
					<StatCardLinkSkeleton />
				</StatCardFooter>
			</StatCard>
			<StatCard className="min-h-[180px]">
				<StatCardHeader className="justify-start gap-3">
					<StatCardIconSkeleton />
					<Skeleton className="h-5 w-24" />
				</StatCardHeader>
				<Skeleton className="h-4 w-full mb-1" />
				<Skeleton className="h-4 w-3/4 flex-1" />
				<StatCardFooter className="border-t-0 pt-0 mt-4">
					<StatCardLinkSkeleton />
				</StatCardFooter>
			</StatCard>
		</div>
	);
}

// ─── Resource Cards, for Welcome Dashboard ──────────────────────

async function ResourceCardsSection() {
	const keys = await api.apiKeys.getApiKeyCount();

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
			<StatCard className="min-h-[180px]">
				<StatCardHeader className="justify-start gap-3">
					<StatCardIcon>
						<Key className="h-5 w-5" />
					</StatCardIcon>
					<StatCardTitle>API Keys</StatCardTitle>
				</StatCardHeader>
				<StatCardDescription>
					You have{" "}
					<span className="text-accent font-medium">{keys.count ?? 0}</span>{" "}
					active API keys for programmatic bot deployment.
				</StatCardDescription>
				<StatCardFooter className="border-t-0 pt-0 mt-4">
					<StatCardLink href="/api-keys">Manage Keys</StatCardLink>
				</StatCardFooter>
			</StatCard>

			<StatCard className="min-h-[180px]">
				<StatCardHeader className="justify-start gap-3">
					<StatCardIcon>
						<File className="h-5 w-5" />
					</StatCardIcon>
					<StatCardTitle>Documentation</StatCardTitle>
				</StatCardHeader>
				<StatCardDescription>
					Learn how to integrate bots, access recordings, and configure
					interactions.
				</StatCardDescription>
				<StatCardFooter className="border-t-0 pt-0 mt-4">
					<StatCardLink href="/docs" external>
						View Docs
					</StatCardLink>
				</StatCardFooter>
			</StatCard>
		</div>
	);
}

// ─── Main Page ──────────────────────────────────────────────────

export default async function Home() {
	const session = await auth.api.getSession({ headers: await headers() });
	const isLoggedIn = !!session?.user;

	// Logged out view
	if (!isLoggedIn) {
		return (
			<main className="mx-auto container px-4">
				<WelcomeHeader />
				<LoggedOutHero />
				<SubscriptionPlansSection />
			</main>
		);
	}

	// Check if user has API keys (established vs new user)
	const apiKeyCount = await api.apiKeys.getApiKeyCount();
	const isNewUser = apiKeyCount.count === 0;

	// New user, show welcome dashboard with subscription plans
	if (isNewUser) {
		return (
			<HydrateClient>
				<main className="mx-auto container px-4">
					<DashboardHeader userName={session.user.name} />

					<div className="mb-8">
						<Suspense fallback={<QuickBotJoinSkeleton />}>
							<QuickBotJoin />
						</Suspense>
					</div>

					<div className="grid gap-6 lg:grid-cols-3 mb-8">
						<div className="lg:col-span-2">
							<Suspense fallback={<RecentBotsSkeleton />}>
								<RecentBotsWithPrefetch />
							</Suspense>
						</div>

						<Suspense fallback={<ResourceCardsSkeleton />}>
							<ResourceCardsSection />
						</Suspense>
					</div>

					<SubscriptionPlansSection />
				</main>
			</HydrateClient>
		);
	}

	// Established user, show full dashboard
	const subscription = await api.bots.getUserSubscription();
	const isFreePlan = subscription.currentPlan === "FREE";

	return (
		<HydrateClient>
			<main className="mx-auto container px-4">
				<DashboardHeader userName={session.user.name} />

				<div className="mb-8">
					<Suspense fallback={<QuickBotJoinSkeleton />}>
						<QuickBotJoin />
					</Suspense>
				</div>

				<div
					className={
						isFreePlan
							? "grid gap-6 lg:grid-cols-3 mb-8"
							: "grid gap-6 lg:grid-cols-3"
					}
				>
					<div className="lg:col-span-2">
						<Suspense fallback={<RecentBotsSkeleton />}>
							<RecentBotsWithPrefetch />
						</Suspense>
					</div>

					<Suspense fallback={<StatCardsSkeleton />}>
						<StatCardsSection timeZone="UTC" />
					</Suspense>
				</div>

				{isFreePlan ? <SubscriptionPlansSection /> : null}
			</main>
		</HydrateClient>
	);
}
