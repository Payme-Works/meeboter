import type { CoolifyBotStatus } from "../coolify/coolify-platform-service";

/**
 * Maps between Coolify API status strings and domain CoolifyBotStatus
 *
 * @see rules/MAPPERS.md
 */
export class CoolifyStatusMapper {
	/**
	 * Maps Coolify API status string to domain CoolifyBotStatus
	 *
	 * @param coolifyStatus - Raw status string from Coolify API
	 * @returns Domain CoolifyBotStatus value
	 */
	static toDomain(coolifyStatus: string): CoolifyBotStatus {
		const status = coolifyStatus.toLowerCase();

		if (status === "running" || status === "healthy") {
			return "HEALTHY";
		}

		if (status === "stopped" || status === "exited" || status === "idle") {
			return "IDLE";
		}

		if (status === "error" || status === "degraded") {
			return "ERROR";
		}

		if (
			status === "starting" ||
			status === "restarting" ||
			status === "deploying"
		) {
			return "DEPLOYING";
		}

		console.warn(
			`[CoolifyStatusMapper] Unrecognized Coolify status: ${coolifyStatus}, defaulting to ERROR`,
		);

		return "ERROR";
	}

	/**
	 * Maps domain CoolifyBotStatus to Coolify API status string
	 *
	 * @param domainStatus - Domain CoolifyBotStatus value
	 * @returns Coolify API status string
	 */
	static toPlatform(domainStatus: CoolifyBotStatus): string {
		switch (domainStatus) {
			case "HEALTHY":
				return "running";
			case "IDLE":
				return "stopped";
			case "DEPLOYING":
				return "starting";
			case "ERROR":
				return "error";
		}
	}
}
