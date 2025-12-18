"use client";

import { getOrderedPlans } from "@/constants/subscription-plans";
import type { Subscription } from "@/server/database/schema";
import SubscriptionPlanCard from "./subscription-plan-card";

interface SubscriptionPlansSectionProps {
	currentPlan?: Subscription | "FREE";
}

export default function SubscriptionPlansSection({
	currentPlan = "FREE",
}: SubscriptionPlansSectionProps) {
	const plans = getOrderedPlans();

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-2xl font-bold text-left">Choose Your Plan</h2>
				<p className="text-gray-600 mt-2 text-left">
					Choose the right plan to deploy engagement bots and enhance your
					meetings
				</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
				{plans.map((plan) => (
					<SubscriptionPlanCard
						key={plan.id}
						plan={plan}
						isCurrentPlan={plan.id === currentPlan}
					/>
				))}
			</div>

			<div className="text-left text-sm text-gray-500">
				<p>
					All plans include secure bot deployment, meeting engagement features,
					and recording capabilities.
				</p>
				<p>
					Need custom engagement solutions? Contact our sales team for
					enterprise bot deployments.
				</p>
			</div>
		</div>
	);
}
