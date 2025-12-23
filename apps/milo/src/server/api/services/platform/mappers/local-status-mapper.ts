import type { ChildProcess } from "node:child_process";

import type { LocalBotStatus } from "../local-platform-service";

/**
 * Maps between local process state and domain LocalBotStatus
 *
 * @see rules/MAPPERS.md
 */
export class LocalStatusMapper {
	/**
	 * Maps local process state to domain LocalBotStatus
	 *
	 * @param process - Child process instance (or undefined if not found)
	 * @returns Domain LocalBotStatus value
	 */
	static toDomain(process: ChildProcess | undefined): LocalBotStatus {
		if (!process) {
			return "STOPPED";
		}

		// Process was killed externally
		if (process.killed) {
			return "STOPPED";
		}

		// Process has exited - distinguish between normal exit and error
		if (process.exitCode !== null) {
			return process.exitCode === 0 ? "STOPPED" : "ERROR";
		}

		return "RUNNING";
	}

	/**
	 * Checks if a process is in a specific domain status
	 *
	 * @param process - Child process instance
	 * @param status - Domain status to check
	 * @returns Whether the process matches the status
	 */
	static isStatus(
		process: ChildProcess | undefined,
		status: LocalBotStatus,
	): boolean {
		return LocalStatusMapper.toDomain(process) === status;
	}
}
