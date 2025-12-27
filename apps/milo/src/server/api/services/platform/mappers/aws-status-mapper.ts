import type { AWSBotStatus } from "../aws/aws-platform-service";

/**
 * Maps between AWS ECS task status strings and domain AWSBotStatus
 *
 * @see rules/MAPPERS.md
 */
export class AWSStatusMapper {
	/**
	 * Maps ECS task status string to domain AWSBotStatus
	 *
	 * @param ecsStatus - Raw status string from ECS API (e.g., RUNNING, STOPPED)
	 * @returns Domain AWSBotStatus value
	 */
	static toDomain(ecsStatus: string | undefined): AWSBotStatus {
		if (!ecsStatus) {
			return "FAILED";
		}

		const status = ecsStatus.toUpperCase();

		if (status === "RUNNING") {
			return "RUNNING";
		}

		if (status === "STOPPED" || status === "DEPROVISIONING") {
			return "STOPPED";
		}

		if (
			status === "PENDING" ||
			status === "ACTIVATING" ||
			status === "PROVISIONING"
		) {
			return "PROVISIONING";
		}

		console.warn(
			`[AWSStatusMapper] Unrecognized ECS status: ${ecsStatus}, defaulting to FAILED`,
		);

		return "FAILED";
	}

	/**
	 * Maps domain AWSBotStatus to ECS task status string
	 *
	 * @param domainStatus - Domain AWSBotStatus value
	 * @returns ECS task status string
	 */
	static toPlatform(domainStatus: AWSBotStatus): string {
		switch (domainStatus) {
			case "RUNNING":
				return "RUNNING";
			case "STOPPED":
				return "STOPPED";
			case "PROVISIONING":
				return "PROVISIONING";
			case "FAILED":
				return "STOPPED";
		}
	}
}
