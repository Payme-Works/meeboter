"use client";

import ErrorAlert from "@/components/custom/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { api } from "@/trpc/react";
import Dashboard from "./_components/dashboard";
import WelcomeDashboard from "./_components/welcome-dashboard";

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
				<div className="space-y-4">
					<div>
						<h1 className="text-3xl font-bold tracking-tight">
							Welcome to Meeboter
							<Skeleton className="ml-2 inline-block h-8 w-80" />
						</h1>

						<p className="mt-2 text-muted-foreground">
							Deploy intelligent bots to boost engagement and participation
							across video meetings.
						</p>
					</div>

					<div className="grid gap-6 lg:grid-cols-3">
						<div className="min-h-0">
							<Skeleton className="h-60 w-full" />
						</div>

						<div className="min-h-0">
							<Skeleton className="h-60 w-full" />
						</div>

						<div className="min-h-0">
							<Skeleton className="h-60 w-full" />
						</div>

						<div className="h-full min-h-0 lg:col-span-3">
							<Skeleton className="h-80 w-full" />
						</div>
					</div>
				</div>
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
