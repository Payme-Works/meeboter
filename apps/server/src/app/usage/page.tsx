"use client";

import {
	PageHeader,
	PageHeaderContent,
	PageHeaderDescription,
	PageHeaderTitle,
} from "@/components/page-header";
import { SubscriptionUsageSummary } from "./_components/subscription-usage-summary";
import { UsageChart } from "./_components/usage-chart";

export default function Usage() {
	return (
		<div className="mx-auto container space-y-6 px-4">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Usage</PageHeaderTitle>
					<PageHeaderDescription>
						Monitor your subscription and bot deployment usage
					</PageHeaderDescription>
				</PageHeaderContent>
			</PageHeader>

			<SubscriptionUsageSummary />

			<UsageChart />
		</div>
	);
}
