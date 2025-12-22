import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
	FreeConfig,
	SubscriptionConfig,
} from "@/constants/subscription-plans";

interface SubscriptionPlanCardProps {
	plan: SubscriptionConfig | FreeConfig;
	isCurrentPlan?: boolean;
}

export default function SubscriptionPlanCard({
	plan,
	isCurrentPlan = false,
}: SubscriptionPlanCardProps) {
	const formatPrice = () => {
		if (plan.monthlyPrice === 0) return "Free";

		if (plan.monthlyPrice === null) {
			if ("pricePerBot" in plan && plan.pricePerBot)
				return `$${plan.pricePerBot}/bot`;

			return "Custom pricing";
		}

		return `$${plan.monthlyPrice}/month`;
	};

	const formatBotLimit = () => {
		if (plan.dailyBotLimit === null) return "Unlimited";

		return `${plan.dailyBotLimit} bots/day`;
	};

	return (
		<Card
			className={`relative flex flex-col h-full ${"popular" in plan && plan.popular ? "border-blue-500" : ""}`}
		>
			{"popular" in plan && plan.popular && (
				<div className="absolute -top-3 left-1/2 -translate-x-1/2">
					<Badge className="bg-blue-500 hover:bg-blue-600">Most Popular</Badge>
				</div>
			)}

			{"comingSoon" in plan && plan.comingSoon && (
				<div className="absolute -top-3 left-1/2 -translate-x-1/2">
					<Badge variant="secondary">Soon</Badge>
				</div>
			)}

			<CardHeader className="text-left">
				<CardTitle className="text-xl text-left">{plan.displayName}</CardTitle>

				<div className="text-3xl font-bold text-blue-600 text-left break-all">
					{formatPrice()}
				</div>

				<div className="text-sm text-gray-600 text-left">
					{formatBotLimit()}
				</div>
			</CardHeader>

			<CardContent className="flex flex-col flex-grow">
				<ul className="space-y-2 flex-grow">
					{plan.features.map((feature) => (
						<li key={feature} className="flex items-start gap-2 text-left">
							<Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
							<span className="text-sm text-left">{feature}</span>
						</li>
					))}
				</ul>

				<div className="mt-4 flex justify-center">
					<Button
						className="w-full"
						variant={isCurrentPlan ? "outline" : plan.buttonVariant}
						disabled={
							("comingSoon" in plan && plan.comingSoon) || isCurrentPlan
						}
					>
						{isCurrentPlan ? "Current Plan" : plan.buttonText}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
