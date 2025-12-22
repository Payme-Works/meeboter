# Motion Animation Library

> **Official Docs:** https://motion.dev/docs/react
> **GitHub:** https://github.com/motiondivision/motion

Motion (formerly Framer Motion) is the animation library for React applications.

## Installation and Import

### Import Syntax (MANDATORY)

```typescript
// Standard React import
import { motion } from "motion/react"

// For React Server Components (Next.js App Router)
import * as motion from "motion/react-client"

// Lightweight m component (for bundle optimization)
import * as m from "motion/react-m"
```

**NEVER use the deprecated import:**
```typescript
// ❌ WRONG - deprecated
import { motion } from "framer-motion"

// ✅ CORRECT
import { motion } from "motion/react"
```

---

## Bundle Size Optimization (MANDATORY)

### Use LazyMotion for Reduced Bundle Size

The full Motion library is ~34kb. Use `LazyMotion` to reduce initial bundle to ~6kb:

```tsx
import { LazyMotion, domAnimation } from "motion/react"
import * as m from "motion/react-m"

function App({ children }) {
    return (
        <LazyMotion features={domAnimation}>
            {children}
        </LazyMotion>
    )
}

// Use m.* instead of motion.*
function MyComponent() {
    return <m.div animate={{ opacity: 1 }} />
}
```

### Lazy Load Features (Recommended for Large Apps)

```tsx
// features.ts
import { domMax } from "motion/react"
export default domMax

// App.tsx
import { LazyMotion } from "motion/react"
import * as m from "motion/react-m"

const loadFeatures = () => import("./features").then(res => res.default)

function App() {
    return (
        <LazyMotion features={loadFeatures}>
            <m.div animate={{ opacity: 1 }} />
        </LazyMotion>
    )
}
```

### Strict Mode (Recommended)

Enable strict mode to catch accidental full `motion` usage:

```tsx
<LazyMotion features={domAnimation} strict>
    {/* Throws error if motion.* is used instead of m.* */}
</LazyMotion>
```

---

## Performance Best Practices (CRITICAL)

### Use Hardware-Accelerated Properties

```typescript
// ✅ GOOD - GPU accelerated transforms
<motion.div animate={{ x: 100, scale: 1.2, rotate: 45 }} />

// ❌ AVOID - Triggers layout/paint
<motion.div animate={{ width: "200px", height: "300px" }} />
```

### Optimize Transform Animations

```typescript
// Add willChange for transform animations
<motion.div
    style={{ willChange: "transform" }}
    animate={{ x: 100, scale: 2 }}
/>
```

### Prefer clipPath over borderRadius for Animation

```typescript
// ❌ Triggers expensive paint
animate(element, { borderRadius: "50px" })

// ✅ Uses compositor acceleration
animate(element, { clipPath: "inset(0 round 50px)" })
```

### Prefer filter over boxShadow for Animation

```typescript
// ❌ Costly paint operations
animate(element, { boxShadow: "10px 10px black" })

// ✅ Hardware accelerated
animate(element, { filter: "drop-shadow(10px 10px black)" })
```

### Use layoutDependency for Layout Animations

```tsx
// ✅ Only measures when isOpen changes
<motion.nav layout layoutDependency={isOpen} />

// ❌ Measures every render (expensive)
<motion.nav layout />
```

---

## Animation Patterns

### Basic Animation

```tsx
<motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
/>
```

### Exit Animations (with AnimatePresence)

```tsx
import { AnimatePresence, motion } from "motion/react"

function Modal({ isOpen }) {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                />
            )}
        </AnimatePresence>
    )
}
```

### Variants for Reusable Animations

```tsx
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
}

function List({ items }) {
    return (
        <motion.ul variants={containerVariants} initial="hidden" animate="visible">
            {items.map(item => (
                <motion.li key={item.id} variants={itemVariants}>
                    {item.name}
                </motion.li>
            ))}
        </motion.ul>
    )
}
```

---

## Gesture Animations

### Hover and Tap

```tsx
<motion.button
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.95 }}
    transition={{ type: "spring", stiffness: 400 }}
/>
```

### With Event Handlers

```tsx
<motion.button
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.95 }}
    onHoverStart={() => console.log("Hover started")}
    onHoverEnd={() => console.log("Hover ended")}
    onTap={() => console.log("Tapped")}
/>
```

### Drag Gesture

```tsx
<motion.div
    drag
    dragConstraints={{ left: 0, right: 300, top: 0, bottom: 200 }}
    whileDrag={{ scale: 1.1, cursor: "grabbing" }}
/>
```

### Gestures with Variants

```tsx
const buttonVariants = {
    hover: { scale: 1.1 },
    tap: { scale: 0.95 }
}

<motion.button
    variants={buttonVariants}
    whileHover="hover"
    whileTap="tap"
/>
```

---

## Layout Animations

### Basic Layout Animation

```tsx
// Automatically animates layout changes
<motion.div layout>
    {isExpanded ? "Expanded content..." : "Short"}
</motion.div>
```

### Shared Layout Animation

```tsx
<motion.div layoutId="shared-element">
    {/* Element animates between positions when layoutId matches */}
</motion.div>
```

### Layout in Scrollable Containers

```tsx
// Add layoutScroll to scrollable parents
<motion.div layoutScroll style={{ overflow: "scroll" }}>
    <motion.div layout />
</motion.div>
```

---

## Spring Animations

```tsx
<motion.div
    animate={{ x: 100 }}
    transition={{
        type: "spring",
        stiffness: 300,
        damping: 20,
        mass: 1
    }}
/>
```

### Recommended Spring Presets

| Use Case | stiffness | damping |
|----------|-----------|---------|
| Snappy UI | 400 | 30 |
| Smooth transitions | 200 | 20 |
| Bouncy | 300 | 10 |
| Heavy/slow | 100 | 30 |

---

## Anti-Patterns to Avoid

### DON'T: Animate Layout-Triggering Properties

```tsx
// ❌ BAD - triggers layout recalc
<motion.div animate={{ width: "100%", height: 200 }} />

// ✅ GOOD - use transforms
<motion.div animate={{ scaleX: 2, scaleY: 1.5 }} />
```

### DON'T: Forget AnimatePresence for Exit Animations

```tsx
// ❌ BAD - exit won't animate
{isVisible && <motion.div exit={{ opacity: 0 }} />}

// ✅ GOOD
<AnimatePresence>
    {isVisible && <motion.div exit={{ opacity: 0 }} />}
</AnimatePresence>
```

### DON'T: Use motion.* with LazyMotion

```tsx
// ❌ BAD - defeats bundle optimization
<LazyMotion features={domAnimation}>
    <motion.div /> {/* Full bundle loaded */}
</LazyMotion>

// ✅ GOOD
<LazyMotion features={domAnimation}>
    <m.div /> {/* Only lazy features loaded */}
</LazyMotion>
```

