# Pool Management Page Design

## Overview

A visualization page for monitoring the bot pool infrastructure in the milo app. Provides real-time visibility into pool capacity, slot status, and deployment queue.

## Goals

- Monitor pool health at a glance (total slots, status distribution, capacity utilization)
- View individual slot details (status, assigned bot, errors, timestamps)
- Track deployment queue (waiting bots, priority, wait times)
- Real-time updates every 5 seconds

## Architecture

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Pool Management                    [● LIVE]   [Refresh 🔄] │
│  Monitor bot pool capacity and deployment queue             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  ┌──────┐ │
│  │  Total  │ │ [IDLE]  │ │[DEPLOY] │ │ [BUSY]  │  │Donut │ │
│  │  37/100 │ │   12    │ │    3    │ │   20    │  │Chart │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  └──────┘ │
│              ┌─────────┐                                    │
│              │ [ERROR] │                                    │
│              │    2    │                                    │
│              └─────────┘                                    │
├─────────────────────────────────────────────────────────────┤
│  Queue (3 waiting)                                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Bot #456 │ Priority: 50  │ Waiting: 2m 30s │ Timeout: 5m│ │
│  │ Bot #789 │ Priority: 100 │ Waiting: 1m 15s │ Timeout: 5m│ │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Pool Slots                          [Status Filter ▼]      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Slot Name    │Status│ Bot │Last Used│Error │ UUID    │  │
│  │ pool-gm-001  │[BUSY]│ #123│ 2m ago  │  -   │ abc...  │  │
│  │ pool-gm-002  │[IDLE]│  -  │ 5m ago  │  -   │ def...  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Visual Aesthetic

**Design Philosophy:** Match existing milo app aesthetic (Satoshi font, sharp corners, motion animations) enhanced with industrial/terminal elements.

**Color Mapping:**
| Status | Color Variable | Terminal Badge |
|--------|---------------|----------------|
| Idle | `chart-2` (green) | `[IDLE]` with subtle pulse |
| Deploying | `accent` (blue) | `[DEPLOYING]` with loading animation |
| Busy | `chart-3` (amber) | `[BUSY]` solid |
| Error | `destructive` (red) | `[ERROR]` with attention indicator |

**Typography:**
- Headers & labels: Satoshi (existing app font)
- Data values (numbers, UUIDs, slot names): `font-mono` for terminal feel
- Status badges: Uppercase, letter-spacing, monospace

**Special Effects:**
- Real-time indicator: Pulsing dot + "LIVE" text in header
- Donut chart: Animated on load, segments match status colors
- Queue entries: Countdown timers in monospace

### Data Refresh

- Auto-refresh every 5 seconds using react-query `refetchInterval`
- Visual "LIVE" indicator with pulsing animation
- Manual refresh button available

## API Design

### tRPC Router Structure

```typescript
// apps/milo/src/server/api/routers/pool.ts

pool.statistics.getPool    // Returns pool statistics
pool.statistics.getQueue   // Returns queue statistics
pool.slots.list            // Returns all slots with optional status filter
pool.queue.list            // Returns queue entries with bot info
```

### Data Schemas

**Pool Statistics:**
```typescript
interface PoolStats {
  total: number;      // Current number of slots
  idle: number;       // Slots ready for assignment
  deploying: number;  // Slots starting up
  busy: number;       // Slots running bots
  error: number;      // Slots in error state
  maxSize: number;    // Maximum pool capacity (100)
}
```

**Queue Statistics:**
```typescript
interface QueueStats {
  length: number;           // Number of waiting bots
  oldestQueuedAt: Date | null;
  avgWaitMs: number;
}
```

**Slot View:**
```typescript
interface PoolSlotView {
  id: number;
  slotName: string;           // "pool-google-meet-001"
  status: "idle" | "deploying" | "busy" | "error";
  assignedBotId: number | null;
  coolifyServiceUuid: string;
  lastUsedAt: Date | null;
  errorMessage: string | null;
  recoveryAttempts: number;
  createdAt: Date;
}
```

**Queue Entry View:**
```typescript
interface QueueEntryView {
  id: number;
  botId: number;
  priority: number;
  queuedAt: Date;
  timeoutAt: Date;
  waitingMs: number;  // Calculated on frontend
}
```

## File Structure

```
apps/milo/src/
├── app/pool/
│   ├── page.tsx                    # Main pool management page
│   └── _components/
│       ├── pool-stats-cards.tsx    # Stats cards grid
│       ├── pool-donut-chart.tsx    # Animated donut chart
│       ├── pool-slots-table.tsx    # Slots table with filtering
│       ├── pool-queue-section.tsx  # Queue entries display
│       └── live-indicator.tsx      # Pulsing "LIVE" badge
│
├── server/api/routers/
│   ├── pool/
│   │   ├── index.ts               # Main pool router
│   │   ├── statistics.ts          # Statistics sub-router
│   │   ├── slots.ts               # Slots sub-router
│   │   └── queue.ts               # Queue sub-router
│   └── root.ts                    # Add pool router
```

## Component Details

### Pool Stats Cards

Grid of 5 stat cards + donut chart:
1. **Total Capacity** - `37/100` with progress bar
2. **Idle** - Green, shows available count
3. **Deploying** - Blue with loading animation
4. **Busy** - Amber, shows active count
5. **Error** - Red, shows problem count

### Donut Chart

- Animated segments on load
- Hover tooltips showing exact counts
- Center text showing total/max
- Uses recharts (if available) or custom SVG

### Pool Slots Table

**Columns:**
| Column | Description |
|--------|-------------|
| Slot Name | e.g., `pool-google-meet-001` (mono font) |
| Status | Terminal-style badge `[IDLE]` |
| Assigned Bot | Bot ID if busy, dash if not |
| Last Used | Relative time (e.g., "2 min ago") |
| Error | Error message or dash |
| Recovery | Number of recovery attempts |
| UUID | Truncated Coolify UUID (mono font) |
| Created | Timestamp |

**Filtering:**
- Dropdown to filter by status (All, Idle, Deploying, Busy, Error)
- Multi-select support

### Queue Section

- Only shown if queue has entries
- Displays waiting bots with:
  - Bot ID
  - Priority level
  - Time waiting (live countdown)
  - Timeout remaining

### Live Indicator

- Pulsing green dot
- "LIVE" text
- Shows "Updated Xs ago" on hover

## Implementation Notes

### Existing Patterns to Reuse

- `PageHeader` component for page title
- `StatCard` pattern from usage page
- `DataTable` component for slots table
- `Badge` component for status indicators
- `motion/react` for animations

### New Components Needed

- Donut chart (can use recharts or custom SVG)
- Live indicator with pulse animation
- Terminal-style status badges
- Queue entry cards

## Scope

**Included:**
- Read-only visualization
- Real-time auto-refresh
- Status filtering
- All slot details

**Not Included (future):**
- Manual slot actions (restart, release, delete)
- Queue management (remove, reprioritize)
- Historical data/charts
- Alerts/notifications
