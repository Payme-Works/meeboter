"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { LiveIndicator } from "@/components/live-indicator";
import { Button } from "@/components/ui/button";

const REFRESH_INTERVAL = 5000;

export function InfrastructureHeaderActions() {
	const [lastUpdated, setLastUpdated] = useState<Date | undefined>(undefined);
	const [isManualRefreshing, setIsManualRefreshing] = useState(false);

	useEffect(() => {
		const interval = setInterval(() => {
			setLastUpdated(new Date());
		}, REFRESH_INTERVAL);

		return () => clearInterval(interval);
	}, []);

	const handleRefresh = async () => {
		setIsManualRefreshing(true);
		await new Promise((resolve) => setTimeout(resolve, 500));
		setIsManualRefreshing(false);
		setLastUpdated(new Date());
	};

	return (
		<>
			<LiveIndicator lastUpdated={lastUpdated} />
			<Button
				variant="outline"
				size="icon"
				onClick={handleRefresh}
				disabled={isManualRefreshing}
			>
				<RefreshCw
					className={`h-4 w-4 ${isManualRefreshing ? "animate-spin" : ""}`}
				/>
			</Button>
		</>
	);
}
