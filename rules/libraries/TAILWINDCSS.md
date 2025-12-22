# Tailwind CSS Rules

> **Official Docs:** https://tailwindcss.com/docs
> **v4 Upgrade Guide:** https://tailwindcss.com/docs/upgrade-guide
> **GitHub:** https://github.com/tailwindlabs/tailwindcss

This project uses **Tailwind CSS v4** with the utility-first approach.

## Key Principles

### Always Use Tailwind Utilities
- **NEVER create custom CSS classes** for styling that can be achieved with Tailwind utilities
- Use arbitrary values `[value]` syntax when predefined values don't exist
- Prefer Tailwind's built-in utilities over custom CSS

### Canonical Class Names (v4)

Tailwind v4 introduces canonical class names. Always use the v4 canonical form:

| Legacy (v3) | Canonical (v4) |
|-------------|----------------|
| `bg-gradient-to-r` | `bg-linear-to-r` |
| `bg-gradient-to-l` | `bg-linear-to-l` |
| `bg-gradient-to-t` | `bg-linear-to-t` |
| `bg-gradient-to-b` | `bg-linear-to-b` |
| `bg-[length:200%_100%]` | `bg-size-[200%_100%]` |
| `bg-[position:center]` | `bg-position-[center]` |

```html
<!-- Bad: Legacy syntax -->
<div class="bg-gradient-to-r bg-[length:200%_100%]">

<!-- Good: Canonical v4 syntax -->
<div class="bg-linear-to-r bg-size-[200%_100%]">
```

### Responsive Design (Mobile-First)

Tailwind CSS uses a mobile-first breakpoint system with min-width media queries:

```css
/* Default breakpoints (min-width) */
sm: @media (width >= 40rem)   /* 640px */
md: @media (width >= 48rem)   /* 768px */
lg: @media (width >= 64rem)   /* 1024px */
xl: @media (width >= 80rem)   /* 1280px */
2xl: @media (width >= 96rem)  /* 1536px */

/* Max-width variants (for targeting smaller screens) */
max-sm: @media (width < 40rem)
max-md: @media (width < 48rem)
max-lg: @media (width < 64rem)
max-xl: @media (width < 80rem)
max-2xl: @media (width < 96rem)

/* Custom breakpoints */
min-[600px]: @media (width >= 600px)
max-[599px]: @media (width < 599px)
```

#### Usage Examples

```html
<!-- Mobile-first: default styles apply to mobile, md: applies to medium+ -->
<div class="text-sm md:text-base lg:text-lg">
  Responsive text
</div>

<!-- Target mobile only using max-sm: -->
<div class="max-sm:hidden">
  Hidden on mobile
</div>

<!-- Combine breakpoints -->
<div class="w-full sm:w-1/2 lg:w-1/3">
  Responsive width
</div>
```

### Important Modifier (`!`)

In Tailwind CSS v4, the `!important` modifier goes at the **end** of the class name:

```html
<!-- v4 syntax (preferred) -->
<div class="bg-red-500! hover:bg-red-600!">
  Important styles
</div>

<!-- With responsive variants -->
<div class="max-sm:left-1/2! max-sm:-translate-x-1/2!">
  Centered on mobile with !important
</div>
```

**When to use `!important`:**
- Override inline styles from third-party libraries (e.g., Radix UI positioning)
- Override styles with higher specificity
- Force styles to take precedence in complex component hierarchies

### Arbitrary Values

Use square bracket notation for one-off values not in the design system:

```html
<!-- Spacing and sizing -->
<div class="top-[117px] w-[calc(100vw-1rem)]">

<!-- Colors -->
<div class="bg-[#bada55] text-[rgb(255,0,0)]">

<!-- CSS custom properties -->
<div class="fill-(--my-brand-color)">

<!-- Complex values -->
<div class="grid-cols-[1fr_2fr_1fr]">
```

### Common Patterns

#### Centering Elements

```html
<!-- Flexbox centering -->
<div class="flex items-center justify-center">

<!-- Absolute centering -->
<div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">

<!-- Mobile-only centering with !important (for overriding library styles) -->
<div class="max-sm:left-1/2! max-sm:-translate-x-1/2!">
```

#### Responsive Visibility

```html
<!-- Hidden on mobile, visible on desktop -->
<div class="hidden sm:block">

<!-- Visible on mobile, hidden on desktop -->
<div class="block sm:hidden">

<!-- Alternative using max-* -->
<div class="max-sm:hidden">  <!-- Hidden below sm breakpoint -->
```

#### Z-Index Scale

Use the project's custom z-index scale defined in `globals.css`:

```html
<div class="z-10">   <!-- --z-10: 10 -->
<div class="z-20">   <!-- --z-20: 20 -->
<div class="z-30">   <!-- --z-30: 30 -->
<div class="z-40">   <!-- --z-40: 40 -->
<div class="z-50">   <!-- --z-50: 50 (header) -->
<div class="z-55">   <!-- --z-55: 55 (overlay) -->
<div class="z-60">   <!-- --z-60: 60 (popover) -->
<div class="z-100">  <!-- --z-100: 100 -->
<div class="z-150">  <!-- --z-150: 150 -->
<div class="z-200">  <!-- --z-200: 200 -->
```

### Dark Mode

This project uses class-based dark mode with the `.dark` class:

```css
@custom-variant dark (&:is(.dark *));
```

```html
<div class="bg-white dark:bg-gray-900">
  Light/dark background
</div>
```

### Adding Custom Styles

When Tailwind utilities aren't sufficient, add styles in the appropriate layer:

```css
/* Base styles - element defaults */
@layer base {
  h1 {
    @apply text-2xl font-bold;
  }
}

/* Component styles - reusable component classes */
@layer components {
  .card {
    @apply rounded-lg bg-card p-6 shadow-md;
  }
}

/* Utility styles - single-purpose utilities */
@layer utilities {
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
}
```

**Prefer `@apply` over raw CSS** when using Tailwind values within custom styles.

### Animation Variables and @keyframes Formatting

When defining custom animations in `globals.css`, always separate animation variables and `@keyframes` blocks with blank lines for better readability:

```css
/* ✅ CORRECT: Blank lines between animation groups and keyframes */
@theme inline {
	--animate-shimmer: shimmer 2.5s linear infinite;

	--animate-collapsible-down: collapsible-down 150ms ease-out forwards;
	--animate-collapsible-up: collapsible-up 150ms ease-out forwards;

	@keyframes collapsible-down {
		from {
			height: 0;
		}
		to {
			height: var(--radix-collapsible-content-height);
		}
	}

	@keyframes collapsible-up {
		from {
			height: var(--radix-collapsible-content-height);
		}
		to {
			height: 0;
		}
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}
}

/* ❌ WRONG: No blank lines between keyframes */
@theme inline {
	--animate-collapsible-down: collapsible-down 150ms ease-out forwards;
	--animate-collapsible-up: collapsible-up 150ms ease-out forwards;
	@keyframes collapsible-down {
		from { height: 0; }
		to { height: var(--radix-collapsible-content-height); }
	}
	@keyframes collapsible-up {
		from { height: var(--radix-collapsible-content-height); }
		to { height: 0; }
	}
}
```

**Formatting rules:**
- Add blank line before `@keyframes` blocks
- Add blank line between each `@keyframes` block
- Group related animation variables together (e.g., `collapsible-down` and `collapsible-up`)
- Add blank line between unrelated animation variable groups

## Anti-Patterns to Avoid

### DON'T: Create custom CSS for simple styling
```css
/* Bad */
.popover-mobile-center {
  left: 50% !important;
  transform: translateX(-50%) !important;
}
```

```html
<!-- Good: Use Tailwind utilities -->
<div class="max-sm:left-1/2! max-sm:-translate-x-1/2!">
```

### DON'T: Use inline styles
```html
<!-- Bad -->
<div style="margin-top: 20px;">

<!-- Good -->
<div class="mt-5">
```

### DON'T: Mix Tailwind with raw CSS for the same property
```html
<!-- Bad -->
<div class="p-4" style="padding-left: 32px;">

<!-- Good -->
<div class="p-4 pl-8">
```

### DON'T: Forget responsive prefixes for mobile-specific styles
```html
<!-- Bad: Affects all screen sizes -->
<div class="left-1/2 -translate-x-1/2">

<!-- Good: Only affects mobile -->
<div class="max-sm:left-1/2 max-sm:-translate-x-1/2">
```

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
