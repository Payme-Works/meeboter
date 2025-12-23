import type { V1JobStatus } from "@kubernetes/client-node";

import type { K8sBotStatus } from "../kubernetes-platform-service";

/**
 * Maps between Kubernetes Job status and domain K8sBotStatus
 *
 * @see rules/MAPPERS.md
 */
export class K8sStatusMapper {
	/**
	 * Maps K8s Job status object to domain K8sBotStatus
	 *
	 * @param jobStatus - Raw status object from K8s Job API
	 * @returns Domain K8sBotStatus value
	 */
	static toDomain(jobStatus: V1JobStatus | undefined): K8sBotStatus {
		if (!jobStatus) {
			return "PENDING";
		}

		if (jobStatus.succeeded && jobStatus.succeeded > 0) {
			return "SUCCEEDED";
		}

		if (jobStatus.failed && jobStatus.failed > 0) {
			return "FAILED";
		}

		if (jobStatus.active && jobStatus.active > 0) {
			return "ACTIVE";
		}

		// Job exists but no pods yet
		return "PENDING";
	}

	/**
	 * Maps domain K8sBotStatus to K8s Job condition type
	 *
	 * @param domainStatus - Domain K8sBotStatus value
	 * @returns K8s Job condition type string
	 */
	static toPlatform(domainStatus: K8sBotStatus): string {
		switch (domainStatus) {
			case "ACTIVE":
				return "Running";
			case "SUCCEEDED":
				return "Complete";
			case "FAILED":
				return "Failed";
			case "PENDING":
				return "Pending";
		}
	}
}
