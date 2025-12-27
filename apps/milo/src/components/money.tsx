import { cn } from "@/lib/utils";

/**
 * Formats monetary value with appropriate decimal places.
 * Shows more decimals for small amounts.
 */
export function formatMoneyValue(value: number): string {
	if (value < 0.01) {
		return value.toFixed(4);
	}

	if (value < 1) {
		return value.toFixed(3);
	}

	if (value < 100) {
		return value.toFixed(2);
	}

	return Math.round(value).toLocaleString();
}

// ─── Composition Components ──────────────────────────────────────────────────

interface MoneyRootProps {
	className?: string;
	children: React.ReactNode;
}

function MoneyRoot({ className, children }: MoneyRootProps) {
	return <span className={cn("whitespace-nowrap", className)}>{children}</span>;
}

interface MoneySymbolProps {
	className?: string;
	children?: React.ReactNode;
}

function MoneySymbol({ className, children = "$" }: MoneySymbolProps) {
	return <span className={cn("font-sans", className)}>{children}</span>;
}

interface MoneyValueProps {
	className?: string;
	children: React.ReactNode;
}

function MoneyValue({ className, children }: MoneyValueProps) {
	return <span className={cn("font-mono", className)}>{children}</span>;
}

interface MoneySuffixProps {
	className?: string;
	children: React.ReactNode;
}

function MoneySuffix({ className, children }: MoneySuffixProps) {
	return <span className={cn("font-sans", className)}>{children}</span>;
}

/**
 * Composition pattern for displaying monetary values.
 * Currency symbol uses font-sans, number uses font-mono.
 *
 * @example
 * <Money>
 *   <Money.Symbol />
 *   <Money.Value>{formatMoneyValue(100)}</Money.Value>
 *   <Money.Suffix>/hr</Money.Suffix>
 * </Money>
 */
export const Money = Object.assign(MoneyRoot, {
	Symbol: MoneySymbol,
	Value: MoneyValue,
	Suffix: MoneySuffix,
});
