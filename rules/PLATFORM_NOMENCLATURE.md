# Platform Nomenclature

This document defines the official terminology and status values for each deployment platform.

## Overview

| Platform | Resource Name | Status Values |
|----------|---------------|---------------|
| **Coolify** | Slots | IDLE, DEPLOYING, HEALTHY, ERROR |
| **Kubernetes** | Jobs | PENDING, ACTIVE, SUCCEEDED, FAILED |
| **AWS ECS** | Tasks | PROVISIONING, RUNNING, STOPPED, FAILED |

## Coolify

> **Docs:** https://coolify.io/docs

### Resource: Slots

Coolify uses a pool-based deployment model with pre-provisioned containers called "slots".

| Status | Description | UI Color |
|--------|-------------|----------|
| `IDLE` | Slot is available and waiting for work | Gray |
| `DEPLOYING` | Slot is being configured or starting | Blue |
| `HEALTHY` | Slot is actively running a bot | Green |
| `ERROR` | Slot has encountered an error | Red |

### API Response Type

```typescript
interface CoolifyStats {
  IDLE: number;
  DEPLOYING: number;
  HEALTHY: number;
  ERROR: number;
}

interface CoolifySlot {
  id: number;
  slotName: string;
  status: "IDLE" | "DEPLOYING" | "HEALTHY" | "ERROR";
  assignedBotId: number | null;
  applicationUuid: string;
}
```

## Kubernetes

> **Docs:** https://kubernetes.io/docs/concepts/workloads/controllers/job/

### Resource: Jobs

Kubernetes uses Jobs for running bot containers. Each bot deployment creates a new Job.

| Status | Description | UI Color |
|--------|-------------|----------|
| `PENDING` | Job is waiting to be scheduled | Yellow |
| `ACTIVE` | Job has running pods | Green |
| `SUCCEEDED` | Job completed successfully | Gray |
| `FAILED` | Job failed | Red |

### API Response Type

```typescript
interface K8sStats {
  PENDING: number;
  ACTIVE: number;
  SUCCEEDED: number;
  FAILED: number;
}

interface K8sJob {
  id: number;
  jobName: string;
  status: "PENDING" | "ACTIVE" | "SUCCEEDED" | "FAILED";
  botId: number;
  createdAt: Date;
  namespace: string;
}
```

### Mapping from K8s API

```typescript
function getJobStatus(job: V1Job): K8sJobStatus {
  const status = job.status;

  if (status?.succeeded && status.succeeded > 0) {
    return "SUCCEEDED";
  }

  if (status?.failed && status.failed > 0) {
    return "FAILED";
  }

  if (status?.active && status.active > 0) {
    return "ACTIVE";
  }

  return "PENDING";
}
```

## AWS ECS

> **Docs:** https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-lifecycle-explanation.html

### Resource: Tasks

AWS ECS uses Fargate Tasks for running bot containers. Tasks are ephemeral and created on-demand.

| Status | Description | UI Color |
|--------|-------------|----------|
| `PROVISIONING` | Task is being provisioned (network, etc.) | Yellow |
| `RUNNING` | Task is actively running | Green |
| `STOPPED` | Task has stopped (completed or terminated) | Gray |
| `FAILED` | Task failed to start or exited with error | Red |

### API Response Type

```typescript
interface AWSStats {
  PROVISIONING: number;
  RUNNING: number;
  STOPPED: number;
  FAILED: number;
}

interface AWSTask {
  id: number;
  taskArn: string;
  status: "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED";
  botId: number;
  createdAt: Date;
  cluster: string;
}
```

### Mapping from ECS API

```typescript
function normalizeEcsStatus(ecsStatus: string | undefined): AWSTaskStatus {
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

  if (status === "PENDING" || status === "ACTIVATING" || status === "PROVISIONING") {
    return "PROVISIONING";
  }

  return "FAILED";
}
```

## UI Consistency

### Status Badge Colors

Use consistent colors across all platforms:

| Semantic | Color | Platforms |
|----------|-------|-----------|
| Available/Waiting | Gray/Yellow | IDLE, PENDING, PROVISIONING |
| In Progress | Blue | DEPLOYING |
| Active/Running | Green | HEALTHY, ACTIVE, RUNNING |
| Completed | Gray | SUCCEEDED, STOPPED |
| Error | Red | ERROR, FAILED |

### Status Badge Component

```typescript
const STATUS_CONFIG: Record<string, { color: string; bgColor: string }> = {
  // Coolify
  IDLE: { color: "text-muted-foreground", bgColor: "bg-muted" },
  DEPLOYING: { color: "text-blue-500", bgColor: "bg-blue-500/10" },
  HEALTHY: { color: "text-green-500", bgColor: "bg-green-500/10" },
  ERROR: { color: "text-destructive", bgColor: "bg-destructive/10" },

  // Kubernetes
  PENDING: { color: "text-amber-500", bgColor: "bg-amber-500/10" },
  ACTIVE: { color: "text-green-500", bgColor: "bg-green-500/10" },
  SUCCEEDED: { color: "text-muted-foreground", bgColor: "bg-muted" },
  FAILED: { color: "text-destructive", bgColor: "bg-destructive/10" },

  // AWS
  PROVISIONING: { color: "text-amber-500", bgColor: "bg-amber-500/10" },
  RUNNING: { color: "text-green-500", bgColor: "bg-green-500/10" },
  STOPPED: { color: "text-muted-foreground", bgColor: "bg-muted" },
};
```
