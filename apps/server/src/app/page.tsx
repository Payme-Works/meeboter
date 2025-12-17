"use client";

import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import Dashboard, { DashboardSkeleton } from "./_components/dashboard";
import WelcomeDashboard, {
	WelcomeDashboardSkeleton,
} from "./_components/welcome-dashboard";

function HomeContent() {
	const { data: session, isPending: sessionPending } = useSession();

	const { data: apiKeyCount, isLoading: apiKeyCountLoading } =
		api.apiKeys.getApiKeyCount.useQuery(undefined, {
			enabled: !!session,
		});

	// Show skeleton while session is loading
	if (sessionPending) {
		return <WelcomeDashboardSkeleton />;
	}

	// Not logged in - show welcome dashboard
	if (!session) {
		return <WelcomeDashboard />;
	}

	// Logged in but still loading API key count - show appropriate skeleton
	if (apiKeyCountLoading) {
		// Show Dashboard skeleton for users with API keys (we assume they have some)
		// This will be refined once data loads
		return <DashboardSkeleton />;
	}

	// Show Welcome dashboard for new users (no API keys)
	// Show Dashboard for established users (have API keys)
	const showWelcome = apiKeyCount?.count === 0;

	if (showWelcome) {
		return <WelcomeDashboard />;
	}

	return <Dashboard />;
}

export default function Home() {
	return (
		<main className="mx-auto container px-4">
			<HomeContent />
		</main>
	);
}
