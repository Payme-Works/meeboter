"use client";

import { SubscriptionUsageSummary } from "./components/subscription-usage-summary";
import { UsageChart } from "./components/usage-chart";

export default function Usage() {
	return (
		<div className="mx-auto container space-y-6 px-4">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">Usage</h2>
					<p className="text-muted-foreground">
						Monitor your subscription and engagement bot deployment usage
					</p>
				</div>
			</div>

			{/* Subscription Usage Summary */}
			<SubscriptionUsageSummary />

			{/* Usage Chart */}
			<div className="space-y-4">
				<div>
					<h3 className="text-lg font-semibold">Historical Usage</h3>
					<p className="text-sm text-muted-foreground">
						View your engagement bot deployment and usage patterns over time
					</p>
				</div>
				<UsageChart />
			</div>
		</div>
	);
}
