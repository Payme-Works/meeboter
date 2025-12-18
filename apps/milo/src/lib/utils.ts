import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines and merges CSS classes using clsx and tailwind-merge
 *
 * Utility implementation for concatenating CSS classes with conflict resolution
 * Uses clsx for conditional classes and tailwind-merge for Tailwind CSS deduplication
 *
 * @param inputs - Variable number of class values (strings, objects, arrays, etc.)
 * @returns Merged and deduplicated CSS class string
 */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
