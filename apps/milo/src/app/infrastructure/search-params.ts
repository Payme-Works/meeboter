import {
	createSearchParamsCache,
	parseAsArrayOf,
	parseAsString,
} from "nuqs/server";

/**
 * Server-side search params cache for infrastructure page
 *
 * URL format examples:
 * - ?status=HEALTHY&status=DEPLOYING - Filter by multiple statuses
 * - ?sort=age.desc - Sort by age descending (default)
 * - ?sort=botId.asc - Sort by bot ID ascending
 * - ?status=ACTIVE&sort=age.asc - Combined filter and sort
 *
 * Status values MUST be UPPERCASE to match platform nomenclature.
 *
 * @see rules/URL_STATE.md
 * @see rules/PLATFORM_NOMENCLATURE.md
 */
export const searchParamsCache = createSearchParamsCache({
	/**
	 * Status filter - array of platform-specific statuses (UPPERCASE)
	 *
	 * Coolify: IDLE, DEPLOYING, HEALTHY, ERROR
	 * K8s: PENDING, ACTIVE, SUCCEEDED, FAILED
	 * AWS: PROVISIONING, RUNNING, STOPPED, FAILED
	 */
	status: parseAsArrayOf(parseAsString).withDefault([]),

	/**
	 * Sort - format: field.asc or field.desc
	 *
	 * Default: age.desc (newest first)
	 */
	sort: parseAsString.withDefault("age.desc"),
});
