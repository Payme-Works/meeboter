"use client";

import { motion } from "motion/react";

interface LiveIndicatorProps {
	lastUpdated?: Date;
}

/**
 * Pulsing "LIVE" indicator for real-time data feeds
 *
 * Displays a green pulsing dot with "LIVE" text in terminal style.
 * Shows relative time since last update on hover (via title).
 */
export function LiveIndicator({ lastUpdated }: LiveIndicatorProps) {
	const getTimeSinceUpdate = () => {
		if (!lastUpdated) return "Connecting...";

		const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000);

		if (seconds < 5) return "Just now";

		if (seconds < 60) return `${seconds}s ago`;

		return `${Math.floor(seconds / 60)}m ago`;
	};

	return (
		<div
			className="flex items-center gap-2 px-2.5 h-8 bg-emerald-500/10 border border-emerald-500/20"
			title={`Last updated: ${getTimeSinceUpdate()}`}
		>
			{/* Pulsing dot */}
			<span className="relative flex h-2 w-2">
				<motion.span
					className="absolute inline-flex h-full w-full bg-emerald-400 opacity-75"
					animate={{
						scale: [1, 1.5, 1],
						opacity: [0.75, 0.25, 0.75],
					}}
					transition={{
						duration: 1.5,
						repeat: Infinity,
						ease: "easeInOut",
					}}
				/>
				<span className="relative inline-flex h-2 w-2 bg-emerald-500" />
			</span>

			{/* LIVE text in terminal style */}
			<span className="font-mono text-[10px] font-semibold tracking-widest text-emerald-500 uppercase">
				Live
			</span>
		</div>
	);
}
