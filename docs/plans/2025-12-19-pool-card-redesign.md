# Pool Card Redesign

**Date:** 2025-12-19
**Status:** Implemented

## Design Direction

**Minimal Status Bar with Dot Grid** - Clean, horizontal approach inspired by Vercel/Linear aesthetics.

## Design Decisions

1. **Layout**: Horizontal, minimal, modern SaaS feel
2. **Visualization**: Dot grid where each dot represents a pool slot
   - Idle slots: Accent color (filled)
   - Busy slots: Amber color (filled)
   - Empty/unprovisioned slots: Muted outline
3. **Footer**: Simple "View Pool →" text link

## Visual Structure

```
┌─────────────────────────────────────────┐
│  ⬡ Pool                                 │
│                                         │
│  ● ● ● ● ● ● ● ● ◐ ◐ ◐ ◐ ○ ○ ○ ○      │
│  └───idle───┘ └─busy─┘ └──empty──┘      │
│                                         │
│  8 idle  ·  4 busy  ·  12/16 slots     │
│                                         │
│  View Pool                          →   │
└─────────────────────────────────────────┘
```

## Color Scheme

- Idle dots: `accent` (primary brand color)
- Busy dots: `amber-500`
- Empty dots: `muted` with border only
- Text: Standard `foreground` and `muted-foreground`

## Implementation Notes

- Dots should wrap naturally if pool has many slots
- Animation on hover (subtle scale or glow)
- Responsive: dots can shrink on smaller screens
- Tooltip on hover showing slot status
