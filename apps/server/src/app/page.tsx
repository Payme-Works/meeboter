"use client";

import ErrorAlert from "@/components/custom/error-alert";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import Dashboard from "./_components/dashboard";
import WelcomeDashboard from "./_components/welcome-dashboard";

function DashboardSkeleton() {
	return (
		<div className="space-y-8">
			<div>
				<Skeleton className="h-9 w-72" />
				<Skeleton className="mt-2 h-5 w-[32rem]" />
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }, (_, i) => (
					<Card key={i} className="min-h-56">
						<CardHeader>
							<div className="flex items-center justify-between">
								<Skeleton className="h-5 w-24" />
								<Skeleton className="h-5 w-5" />
							</div>
						</CardHeader>

						<CardContent>
							<Skeleton className="h-10 w-12" />
						</CardContent>

						<CardFooter className="mt-auto">
							<Skeleton className="h-5 w-24" />
						</CardFooter>
					</Card>
				))}
			</div>
		</div>
	);
}

function HomeContent() {
	const { data: session, isPending } = useSession();

	const {
		data: apiKeyCount,
		isLoading: apiKeyCountIsLoading,
		error: apiKeyCountError,
	} = api.apiKeys.getApiKeyCount.useQuery(undefined, {
		enabled: !!session,
	});

	const isLoading = isPending || apiKeyCountIsLoading;

	if (isLoading) {
		return <DashboardSkeleton />;
	}

	if (apiKeyCountError) {
		return <ErrorAlert errorMessage={apiKeyCountError.message} />;
	}

	const showWelcome = !session || apiKeyCount?.count === 0;

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
