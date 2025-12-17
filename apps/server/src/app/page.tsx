"use client";

import ErrorAlert from "@/components/custom/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import Dashboard from "./_components/dashboard";
import WelcomeDashboard from "./_components/welcome-dashboard";

function DashboardSkeleton() {
	return (
		<div className="space-y-8">
			<div className="space-y-2">
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-5 w-96" />
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{Array.from({ length: 3 }, (_, i) => (
					<div key={i} className="border p-6 space-y-4">
						<div className="flex items-center justify-between">
							<Skeleton className="h-5 w-24" />
							<Skeleton className="h-5 w-5" />
						</div>
						<Skeleton className="h-10 w-16" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-20" />
					</div>
				))}
			</div>
		</div>
	);
}

export default function Home() {
	const { data: session, isPending } = useSession();

	const {
		data: apiKeyCount,
		isLoading: apiKeyCountIsLoading,
		error: apiKeyCountError,
	} = api.apiKeys.getApiKeyCount.useQuery(undefined, {
		enabled: !!session,
	});

	const isLoading = isPending || apiKeyCountIsLoading;
	const showWelcome = !session || apiKeyCount?.count === 0;

	return (
		<main className="mx-auto container px-4">
			{isLoading ? (
				<DashboardSkeleton />
			) : apiKeyCountError ? (
				<ErrorAlert errorMessage={apiKeyCountError.message} />
			) : showWelcome ? (
				<WelcomeDashboard />
			) : (
				<Dashboard />
			)}
		</main>
	);
}
