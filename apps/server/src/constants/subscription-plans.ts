import type { Subscription } from "@/server/database/schema";

export interface SubscriptionConfig {
	id: Subscription;
	displayName: string;
	dailyBotLimit: number | null;
	monthlyPrice: number | null;
	pricePerBot?: number;
	features: string[];
	popular?: boolean;
	comingSoon?: boolean;
	buttonText: string;
	buttonVariant: "default" | "outline" | "secondary";
}

export interface FreeConfig {
	id: "FREE";
	displayName: string;
	dailyBotLimit: number;
	monthlyPrice: number;
	features: string[];
	buttonText: string;
	buttonVariant: "outline";
}

export const FREE_PLAN: FreeConfig = {
	id: "FREE",
	displayName: "Free Plan",
	dailyBotLimit: 5,
	monthlyPrice: 0,
	features: [
		"5 engagement bots per day",
		"Basic meeting interactions",
		"Standard support",
		"Meeting recordings",
	],
	buttonText: "Current Plan",
	buttonVariant: "outline",
};

export const SUBSCRIPTION_PLANS: Record<Subscription, SubscriptionConfig> = {
	PRO: {
		id: "PRO",
		displayName: "Pro Plan",
		dailyBotLimit: 200,
		monthlyPrice: 29.99,
		features: [
			"200 engagement bots per day",
			"Advanced interaction features",
			"Priority support",
			"Extended recordings",
			"Analytics dashboard",
		],
		popular: true,
		buttonText: "Upgrade",
		buttonVariant: "default",
	},
	PAY_AS_YOU_GO: {
		id: "PAY_AS_YOU_GO",
		displayName: "Pay-as-You-Go",
		dailyBotLimit: null,
		monthlyPrice: null,
		pricePerBot: 0.5,
		features: [
			"No daily bot limits",
			"Pay per engagement bot deployed",
			"Priority support",
			"Advanced interaction analytics",
			"Custom engagement features",
		],
		comingSoon: true,
		buttonText: "Coming Soon",
		buttonVariant: "secondary",
	},
	CUSTOM: {
		id: "CUSTOM",
		displayName: "Enterprise",
		dailyBotLimit: null,
		monthlyPrice: null,
		features: [
			"Custom engagement bot limits",
			"Advanced interaction features",
			"Dedicated support",
			"SLA guarantee",
			"Custom engagement workflows",
			"On-premise deployment",
		],
		buttonText: "Contact Sales",
		buttonVariant: "outline",
	},
};

export const getOrderedPlans = (): (FreeConfig | SubscriptionConfig)[] => {
	return [
		FREE_PLAN,
		SUBSCRIPTION_PLANS.PRO,
		SUBSCRIPTION_PLANS.PAY_AS_YOU_GO,
		SUBSCRIPTION_PLANS.CUSTOM,
	];
};
