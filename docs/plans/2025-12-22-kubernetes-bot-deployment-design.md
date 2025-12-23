# Kubernetes Bot Deployment Design

**Date**: 2025-12-22
**Status**: Approved
**Author**: Claude (AI Assistant)

## Executive Summary

This document describes the design for adding Kubernetes as a third deployment platform for Meeboter bots, alongside existing Coolify and AWS ECS platforms. The implementation uses K3s on a Proxmox VM with an ephemeral Jobs model (similar to AWS ECS) for predictable deployments and excellent observability.

**Cluster Architecture**: The K3s cluster is designed as a **shared multi-project cluster** using Kubernetes namespaces for isolation. Meeboter bots run in the `meeboter` namespace, while other projects can use their own namespaces with independent ResourceQuotas.

## Goals

1. Add Kubernetes as a third deployment platform option
2. Achieve AWS ECS-like behavior (ephemeral, predictable, observable)
3. Support 40-80 concurrent bots on current hardware (24 CPU, 64GB)
4. Design for future scale to 200-500 bots with multi-node HA cluster
5. Integrate with existing frontend for bot status monitoring

## Non-Goals

- Replacing Coolify or AWS ECS (K8s is an additional option)
- Pool-based deployment (using Jobs for simplicity)
- KEDA auto-scaling (can be added later)

---

## Configuration Summary

### Infrastructure

| Setting | Value |
|---------|-------|
| Proxmox Server | 24 CPU, 64GB RAM |
| K3s VM Type | VM (not LXC) |
| K3s VM ID | 102 |
| K3s VM Name | `k3s-0` |
| K3s VM IP | 192.168.18.102 (static) |
| K3s VM Resources | 20 CPU, 56GB RAM, 200GB SSD |
| K3s VM OS | Ubuntu 24.04 LTS Server |
| Network | Bridge to LAN (192.168.18.0/24) |

### Node Naming Convention

| VM ID | Name | IP | Role |
|-------|------|-----|------|
| 102 | `k3s-0` | 192.168.18.102 | Initial server (control-plane + worker) |
| 103 | `k3s-1` | 192.168.18.103 | Future: HA server node |
| 104 | `k3s-2` | 192.168.18.104 | Future: HA server node |

### Existing Infrastructure (Unchanged)

| CT/VM | Name | IP | Purpose |
|-------|------|-----|---------|
| CT 100 | Coolify | 192.168.18.100 | Milo API + current bot deployments |
| CT 101 | NextCloud | 192.168.18.101 | File storage |
| **VM 102** | **k3s-0** | **192.168.18.102** | **Shared K8s cluster (NEW)** |

### Kubernetes Cluster

| Setting | Value |
|---------|-------|
| Distribution | K3s |
| HA Mode | Embedded etcd (single node now, HA-ready) |
| Architecture | Shared multi-project cluster |
| Meeboter Namespace | `meeboter` |
| Deployment Model | Kubernetes Jobs (ephemeral) |
| Max Pods | 150 |

### Container Images

| Bot | Image |
|-----|-------|
| Google Meet | `ghcr.io/payme-works/meeboter-google-meet-bot:latest` |
| Zoom | `ghcr.io/payme-works/meeboter-zoom-bot:latest` |
| Microsoft Teams | `ghcr.io/payme-works/meeboter-microsoft-teams-bot:latest` |

### Bot Resources (per bot)

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 150m (0.15 vCPU) | 500m (0.5 vCPU) |
| Memory | 512Mi | 1Gi |

> **Note**: Requests are for scheduling (80 × 150m = 12 cores). Limits allow burst during video processing. Overcommit on limits is expected and safe for variable workloads. Each pod also gets 512Mi shared memory volume for Chromium.

### Capacity Estimation

| Nodes | Total CPU | Total RAM | Conservative | With Overcommit |
|-------|-----------|-----------|--------------|-----------------|
| 1 (current) | 20 cores | 56 GB | 40 bots | 80 bots |
| 3 (future) | 60 cores | 168 GB | 120 bots | 240 bots |

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           MULTI-PLATFORM BOT DEPLOYMENT                                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              MILO API SERVER (on Coolify)                                │
│                                  192.168.18.100                                          │
│                                                                                          │
│  ┌────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                            PlatformFactory                                          │ │
│  │                                                                                     │ │
│  │   DEPLOYMENT_PLATFORM = "coolify" | "aws" | "k8s" | "local"                        │ │
│  │                                                                                     │ │
│  │   switch (platform) {                                                               │ │
│  │     case 'coolify': return CoolifyPlatformService();   // Existing                 │ │
│  │     case 'aws':     return AWSPlatformService();       // Existing                 │ │
│  │     case 'k8s':     return KubernetesPlatformService(); // NEW                     │ │
│  │     case 'local':   return LocalPlatformService();     // Existing                 │ │
│  │   }                                                                                 │ │
│  └────────────────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────-─┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
              ▼                           ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ Coolify (Docker)        │ │ AWS ECS (Fargate)       │ │ Kubernetes (K3s)        │
│ 192.168.18.100          │ │ AWS Cloud               │ │ 192.168.18.102          │
│                         │ │                         │ │                         │
│ Pool-based model        │ │ Ephemeral tasks         │ │ Ephemeral Jobs          │
│ Pre-provisioned slots   │ │ On-demand creation      │ │ On-demand creation      │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

### K3s Cluster Topology (Multi-Project)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              PROXMOX HOST (24 CPU, 64GB)                                 │
│                                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐│
│  │ VM 102: k3s-0                                                                       ││
│  │ IP: 192.168.18.102                                                                  ││
│  │ Resources: 20 CPU, 56GB RAM, 200GB SSD                                              ││
│  │ OS: Ubuntu 24.04 LTS                                                                ││
│  │                                                                                      ││
│  │  ┌─────────────────────────────────────────────────────────────────────────────────┐││
│  │  │ K3s Server (control plane + worker)                                             │││
│  │  │                                                                                  │││
│  │  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐                 │││
│  │  │  │ ns: meeboter     │ │ ns: project-b    │ │ ns: monitoring   │                 │││
│  │  │  │ (this project)   │ │ (future)         │ │ (optional)       │                 │││
│  │  │  │                  │ │                  │ │                  │                 │││
│  │  │  │ ┌────┐ ┌────┐    │ │ Your other       │ │ Prometheus       │                 │││
│  │  │  │ │Job │ │Job │    │ │ workloads...     │ │ Grafana          │                 │││
│  │  │  │ │Bot1│ │Bot2│    │ │                  │ │                  │                 │││
│  │  │  │ └────┘ └────┘    │ │                  │ │                  │                 │││
│  │  │  │ ResourceQuota:   │ │ ResourceQuota:   │ │                  │                 │││
│  │  │  │ 10 CPU, 20GB     │ │ 5 CPU, 10GB      │ │                  │                 │││
│  │  │  └──────────────────┘ └──────────────────┘ └──────────────────┘                 │││
│  │  │                                                                                  │││
│  │  │  ┌──────────────────┐                                                           │││
│  │  │  │ ns: kube-system  │  (K3s internals: CoreDNS, Metrics Server, etc.)           │││
│  │  │  └──────────────────┘                                                           │││
│  │  └─────────────────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────────────────┘│
│                                                                                          │
│  ┌───────────────────────┐  ┌───────────────────────┐                                   │
│  │ CT 100: Coolify       │  │ CT 101: NextCloud     │                                   │
│  │ 192.168.18.100        │  │ 192.168.18.101        │                                   │
│  │ (Milo API stays here) │  │                       │                                   │
│  └───────────────────────┘  └───────────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Future HA Cluster (Phase 2)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           FUTURE: 3-NODE HA CLUSTER                                      │
│                                                                                          │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐  │
│  │ Server 1                │  │ Server 2 (future)       │  │ Server 3 (future)       │  │
│  │ 24 CPU | 64GB           │  │ 24 CPU | 64GB           │  │ 24 CPU | 64GB           │  │
│  │                         │  │                         │  │                         │  │
│  │  ┌───────────────────┐  │  │  ┌───────────────────┐  │  │  ┌───────────────────┐  │  │
│  │  │ VM: k3s-0         │  │  │  │ VM: k3s-1         │  │  │  │ VM: k3s-2         │  │  │
│  │  │ 192.168.18.102    │  │  │  │ 192.168.18.103    │  │  │  │ 192.168.18.104    │  │  │
│  │  │                   │  │  │  │                   │  │  │  │                   │  │  │
│  │  │ K3s Server        │  │  │  │ K3s Server        │  │  │  │ K3s Server        │  │  │
│  │  │ + embedded etcd   │  │  │  │ + embedded etcd   │  │  │  │ + embedded etcd   │  │  │
│  │  │                   │  │  │  │                   │  │  │  │                   │  │  │
│  │  │ ~60-80 bots       │  │  │  │ ~60-80 bots       │  │  │  │ ~60-80 bots       │  │  │
│  │  └───────────────────┘  │  │  └───────────────────┘  │  │  └───────────────────┘  │  │
│  └─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘  │
│                                                                                          │
│  Total Capacity: 180-240 concurrent bots (conservative) or 360-500 (with overcommit)   │
│  Fault Tolerance: 1 node failure (etcd quorum: 2 of 3)                                  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           KUBERNETES BOT DEPLOYMENT FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘

    User Request: Deploy Bot
         │
         ▼
┌─────────────────────┐
│ BotDeploymentService│
│  .deploy()          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐    DEPLOYMENT_PLATFORM="k8s"
│  PlatformFactory    │────────────────────────────────┐
└─────────────────────┘                                │
                                                       ▼
                            ┌────────────────────────────────────────────────────────────┐
                            │              KubernetesPlatformService                      │
                            │                                                             │
                            │  1. Build Job spec with:                                    │
                            │     - Bot image (ghcr.io/payme-works/meeboter-...)         │
                            │     - Environment variables (MILO_URL, S3 config, etc.)    │
                            │     - Resource requests/limits                              │
                            │     - Labels for tracking                                   │
                            │                                                             │
                            │  2. Create Job via K8s API:                                 │
                            │     k8sApi.createNamespacedJob('bots', jobSpec)            │
                            │                                                             │
                            │  3. Return platformIdentifier: "bot-{botId}-{timestamp}"   │
                            └────────────────────────────────────────────────────────────┘
                                                       │
                                                       ▼
                            ┌────────────────────────────────────────────────────────────┐
                            │                    K3S CLUSTER                              │
                            │                                                             │
                            │  ┌──────────────────────────────────────────────────────┐  │
                            │  │                 JOB LIFECYCLE                         │  │
                            │  │                                                       │  │
                            │  │  Job Created                                          │  │
                            │  │       │                                               │  │
                            │  │       ▼                                               │  │
                            │  │  K8s Scheduler → Find node with capacity             │  │
                            │  │       │                                               │  │
                            │  │       ▼                                               │  │
                            │  │  Pod Created (status: Pending)                        │  │
                            │  │       │                                               │  │
                            │  │       ▼                                               │  │
                            │  │  Container Created (status: ContainerCreating)        │  │
                            │  │       │                                               │  │
                            │  │       ▼                                               │  │
                            │  │  Bot Running (status: Running)                        │  │
                            │  │       │                                               │  │
                            │  │       ├─► Meeting ended normally                      │  │
                            │  │       │         │                                     │  │
                            │  │       │         ▼                                     │  │
                            │  │       │   Pod Succeeded → Job Complete                │  │
                            │  │       │                                               │  │
                            │  │       └─► Bot crashed/error                           │  │
                            │  │                 │                                     │  │
                            │  │                 ▼                                     │  │
                            │  │           Pod Failed → Job Failed                     │  │
                            │  │                                                       │  │
                            │  │       TTL: Auto-delete after 5 minutes                │  │
                            │  └──────────────────────────────────────────────────────┘  │
                            └────────────────────────────────────────────────────────────┘
```

---

## Implementation

### KubernetesPlatformService

**File**: `apps/milo/src/server/api/services/platform/kubernetes-platform-service.ts`

```typescript
import {
  KubeConfig,
  BatchV1Api,
  CoreV1Api,
  V1Job,
  V1Pod,
} from "@kubernetes/client-node";
import type {
  PlatformService,
  DeployBotParams,
  DeployBotResult,
  BotPlatformStatus,
} from "./platform-service";

export class KubernetesPlatformService implements PlatformService {
  private batchApi: BatchV1Api;
  private coreApi: CoreV1Api;
  private namespace: string;
  private imageRegistry: string;
  private imageTag: string;

  constructor() {
    const kc = new KubeConfig();

    // Load kubeconfig: in-cluster or external
    if (process.env.KUBERNETES_SERVICE_HOST) {
      kc.loadFromCluster();
    } else if (process.env.K8S_KUBECONFIG) {
      kc.loadFromFile(process.env.K8S_KUBECONFIG);
    } else {
      kc.loadFromDefault();
    }

    this.batchApi = kc.makeApiClient(BatchV1Api);
    this.coreApi = kc.makeApiClient(CoreV1Api);
    this.namespace = process.env.K8S_NAMESPACE || "bots";
    this.imageRegistry = process.env.K8S_IMAGE_REGISTRY || "ghcr.io/payme-works";
    this.imageTag = process.env.K8S_IMAGE_TAG || "latest";
  }

  async deployBot(params: DeployBotParams): Promise<DeployBotResult> {
    const jobName = this.buildJobName(params.botId);
    const job = this.buildJobSpec(params, jobName);

    console.log(
      `[KubernetesPlatformService] Creating job ${jobName} for bot ${params.botId}`
    );

    try {
      await this.batchApi.createNamespacedJob(this.namespace, job);

      return {
        platformIdentifier: jobName,
        status: "deploying",
        message: `Kubernetes Job ${jobName} created`,
      };
    } catch (error) {
      console.error(`[KubernetesPlatformService] Failed to create job:`, error);
      throw error;
    }
  }

  async getBotStatus(jobName: string): Promise<BotPlatformStatus> {
    try {
      const { body: job } = await this.batchApi.readNamespacedJobStatus(
        jobName,
        this.namespace
      );

      const status = job.status;

      if (status?.succeeded && status.succeeded > 0) {
        return { status: "completed", message: "Job completed successfully" };
      }
      if (status?.failed && status.failed > 0) {
        const reason = await this.getFailureReason(jobName);
        return { status: "failed", message: reason || "Job failed" };
      }
      if (status?.active && status.active > 0) {
        return { status: "running", message: "Bot is running" };
      }

      return { status: "pending", message: "Job is pending" };
    } catch (error: any) {
      if (error.statusCode === 404) {
        return { status: "not_found", message: "Job not found (may be cleaned up)" };
      }
      throw error;
    }
  }

  async stopBot(jobName: string): Promise<void> {
    console.log(`[KubernetesPlatformService] Stopping job ${jobName}`);

    try {
      await this.batchApi.deleteNamespacedJob(
        jobName,
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        "Foreground"
      );
    } catch (error: any) {
      if (error.statusCode !== 404) {
        throw error;
      }
      // Job already deleted, ignore
    }
  }

  async releaseBot(jobName: string): Promise<void> {
    // Jobs auto-cleanup via TTL, but we can force delete if needed
    try {
      await this.stopBot(jobName);
    } catch (error) {
      console.log(`[KubernetesPlatformService] Job ${jobName} already cleaned up`);
    }
  }

  async processQueuedBots(): Promise<void> {
    // No queue for K8s - jobs are created on-demand
    // K8s scheduler handles resource allocation automatically
  }

  // Additional methods for observability
  async getJobWithPods(jobName: string) {
    const { body: job } = await this.batchApi.readNamespacedJob(
      jobName,
      this.namespace
    );

    const { body: podList } = await this.coreApi.listNamespacedPod(
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `job-name=${jobName}`
    );

    const { body: eventList } = await this.coreApi.listNamespacedEvent(
      this.namespace,
      undefined,
      undefined,
      undefined,
      `involvedObject.name=${jobName}`
    );

    return {
      ...job,
      pods: podList.items,
      events: eventList.items,
    };
  }

  async getPodLogs(jobName: string): Promise<string> {
    const { body: podList } = await this.coreApi.listNamespacedPod(
      this.namespace,
      undefined,
      undefined,
      undefined,
      undefined,
      `job-name=${jobName}`
    );

    if (podList.items.length === 0) {
      return "No pods found for job";
    }

    const podName = podList.items[0].metadata?.name;
    if (!podName) {
      return "Pod name not found";
    }

    const { body: logs } = await this.coreApi.readNamespacedPodLog(
      podName,
      this.namespace
    );

    return logs;
  }

  private buildJobName(botId: number): string {
    return `bot-${botId}-${Date.now()}`;
  }

  private buildJobSpec(params: DeployBotParams, jobName: string): V1Job {
    const image = this.getImageForPlatform(params.meetingPlatform);

    return {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: this.namespace,
        labels: {
          app: "meeboter-bot",
          platform: params.meetingPlatform,
          botId: params.botId.toString(),
        },
      },
      spec: {
        backoffLimit: 0,
        ttlSecondsAfterFinished: 300,
        template: {
          metadata: {
            labels: {
              app: "meeboter-bot",
              platform: params.meetingPlatform,
              botId: params.botId.toString(),
            },
          },
          spec: {
            restartPolicy: "Never",
            imagePullSecrets: [{ name: "ghcr-credentials" }],
            containers: [
              {
                name: "bot",
                image,
                env: this.buildEnvVars(params),
                resources: {
                  requests: {
                    cpu: process.env.K8S_BOT_CPU_REQUEST || "250m",
                    memory: process.env.K8S_BOT_MEMORY_REQUEST || "768Mi",
                  },
                  limits: {
                    cpu: process.env.K8S_BOT_CPU_LIMIT || "500m",
                    memory: process.env.K8S_BOT_MEMORY_LIMIT || "1Gi",
                  },
                },
              },
            ],
          },
        },
      },
    };
  }

  private getImageForPlatform(platform: string): string {
    const platformImageMap: Record<string, string> = {
      "google-meet": `${this.imageRegistry}/meeboter-google-meet-bot:${this.imageTag}`,
      "zoom": `${this.imageRegistry}/meeboter-zoom-bot:${this.imageTag}`,
      "microsoft-teams": `${this.imageRegistry}/meeboter-microsoft-teams-bot:${this.imageTag}`,
    };

    return platformImageMap[platform] || platformImageMap["google-meet"];
  }

  private buildEnvVars(params: DeployBotParams) {
    return [
      { name: "POOL_SLOT_UUID", value: params.botId.toString() },
      { name: "MILO_URL", value: process.env.MILO_URL },
      { name: "MILO_AUTH_TOKEN", value: process.env.MILO_AUTH_TOKEN },
      { name: "S3_ENDPOINT", value: process.env.S3_ENDPOINT },
      { name: "S3_ACCESS_KEY", value: process.env.S3_ACCESS_KEY },
      { name: "S3_SECRET_KEY", value: process.env.S3_SECRET_KEY },
      { name: "S3_BUCKET_NAME", value: process.env.S3_BUCKET_NAME },
      { name: "NODE_ENV", value: "production" },
    ].filter(env => env.value !== undefined);
  }

  private async getFailureReason(jobName: string): Promise<string | null> {
    try {
      const { body: podList } = await this.coreApi.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `job-name=${jobName}`
      );

      if (podList.items.length === 0) return null;

      const pod = podList.items[0];
      const containerStatus = pod.status?.containerStatuses?.[0];

      if (containerStatus?.state?.terminated?.reason) {
        return containerStatus.state.terminated.reason;
      }

      return null;
    } catch {
      return null;
    }
  }
}
```

### Environment Variables

**File**: `apps/milo/src/env.ts` (additions)

```typescript
// Kubernetes Platform Configuration
K8S_NAMESPACE: z.string().default("bots"),
K8S_IMAGE_REGISTRY: z.string().default("ghcr.io/payme-works"),
K8S_IMAGE_TAG: z.string().default("latest"),
K8S_KUBECONFIG: z.string().optional(),

// Bot Resource Configuration
K8S_BOT_CPU_REQUEST: z.string().default("250m"),
K8S_BOT_CPU_LIMIT: z.string().default("500m"),
K8S_BOT_MEMORY_REQUEST: z.string().default("768Mi"),
K8S_BOT_MEMORY_LIMIT: z.string().default("1Gi"),
```

### Platform Factory Update

**File**: `apps/milo/src/server/api/services/platform/platform-factory.ts`

```typescript
// Add to switch statement
case "k8s":
case "kubernetes":
  return new KubernetesPlatformService();
```

---

## Kubernetes Manifests

### Namespace and ResourceQuota (per project)

**File**: `k8s/meeboter-namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: meeboter
  labels:
    app.kubernetes.io/name: meeboter
    project: meeboter
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: meeboter-quota
  namespace: meeboter
spec:
  hard:
    requests.cpu: "10"       # Reserve 10 CPU for meeboter
    requests.memory: "20Gi"  # Reserve 20GB for meeboter
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "80"
```

**Example for another project** (not part of this deployment):
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: project-b
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: project-b-quota
  namespace: project-b
spec:
  hard:
    requests.cpu: "5"
    requests.memory: "10Gi"
    pods: "20"
```

### Image Pull Secret

**File**: `k8s/secrets/ghcr-credentials.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-credentials
  namespace: meeboter  # Create per namespace that needs it
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64-encoded-docker-config>
```

### Image Pre-puller DaemonSet

**File**: `k8s/image-prepuller.yaml`

Runs in `meeboter` namespace but pre-pulls images to all nodes (benefits cluster-wide).

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: image-prepuller
  namespace: meeboter
spec:
  selector:
    matchLabels:
      app: image-prepuller
  template:
    metadata:
      labels:
        app: image-prepuller
    spec:
      imagePullSecrets:
        - name: ghcr-credentials
      initContainers:
        - name: prepull-google-meet
          image: ghcr.io/payme-works/meeboter-google-meet-bot:latest
          command: ["echo", "Image pulled"]
          resources:
            limits:
              memory: "64Mi"
              cpu: "50m"
        - name: prepull-zoom
          image: ghcr.io/payme-works/meeboter-zoom-bot:latest
          command: ["echo", "Image pulled"]
          resources:
            limits:
              memory: "64Mi"
              cpu: "50m"
        - name: prepull-teams
          image: ghcr.io/payme-works/meeboter-microsoft-teams-bot:latest
          command: ["echo", "Image pulled"]
          resources:
            limits:
              memory: "64Mi"
              cpu: "50m"
      containers:
        - name: pause
          image: registry.k8s.io/pause:3.9
          resources:
            limits:
              memory: "16Mi"
              cpu: "10m"
```

---

## Observability

### Monitoring Stack

- **Prometheus**: Metrics collection
- **Grafana**: Dashboards and visualization
- **kube-state-metrics**: Kubernetes object metrics

### Key Metrics

| Metric | Description |
|--------|-------------|
| `kube_job_status_active{namespace="bots"}` | Active bot jobs |
| `kube_job_status_succeeded{namespace="bots"}` | Completed bot jobs |
| `kube_job_status_failed{namespace="bots"}` | Failed bot jobs |
| `container_cpu_usage_seconds_total{namespace="bots"}` | CPU usage |
| `container_memory_usage_bytes{namespace="bots"}` | Memory usage |

### Frontend Integration

Update bot details dialog to show K8s-specific status:
- Job status (Pending, Running, Succeeded, Failed)
- Pod phase
- Node name
- Resource usage
- Events/errors

---

## Complete Proxmox + K3s Setup Guide (Junior-Friendly)

This guide walks through setting up K3s on Proxmox from scratch. Follow each step exactly.

### Prerequisites

Before starting, ensure you have:
- [ ] Access to Proxmox web UI (typically `https://your-proxmox-ip:8006`)
- [ ] Proxmox login credentials
- [ ] Ubuntu 22.04 Server ISO uploaded to Proxmox (or download link)
- [ ] Network information:
  - Gateway IP (usually your router, e.g., `192.168.18.1`)
  - DNS server (usually same as gateway)
  - Available static IP: `192.168.18.102`

### Step 1: Download Ubuntu ISO (if not already uploaded)

1. Open Proxmox web UI
2. Select your storage (e.g., `local`)
3. Click **ISO Images** → **Download from URL**
4. Enter URL: `https://releases.ubuntu.com/24.04.3/ubuntu-24.04.3-live-server-amd64.iso`
5. Click **Query URL** → **Download**
6. Wait for download to complete

### Step 2: Create the VM in Proxmox

1. Click **Create VM** button (top right)

**General Tab:**
```
Node: (your proxmox node)
VM ID: 102
Name: k3s-0
```

**OS Tab:**
```
Storage: local
ISO image: ubuntu-24.04.3-live-server-amd64.iso
Type: Linux
Version: 6.x - 2.6 Kernel
```

**System Tab:**
```
Machine: q35
BIOS: OVMF (UEFI)
EFI Storage: local-lvm
SCSI Controller: VirtIO SCSI
Qemu Agent: ✓ (checked)
```

**Disks Tab:**
```
Bus/Device: SCSI
Storage: local-lvm
Disk size: 200 GB
Cache: Write back
Discard: ✓ (checked)
SSD emulation: ✓ (checked)
```

**CPU Tab:**
```
Cores: 20
Type: host (for best performance)
```

**Memory Tab:**
```
Memory: 57344 MB (56 GB)
Ballooning Device: ✗ (unchecked - disable for K8s)
```

**Network Tab:**
```
Bridge: vmbr0
Model: VirtIO
Firewall: ✗ (unchecked)
```

2. Click **Finish** to create the VM

### Step 3: Install Ubuntu Server

1. Select VM 102 → Click **Start**
2. Open **Console** (noVNC or xterm.js)
3. Follow Ubuntu installer:

**Language:** English

**Installer Update:** Continue without updating

**Keyboard:** Your layout (e.g., English US)

**Installation Type:** Ubuntu Server

**Network Configuration:**
```
Edit IPv4:
  IPv4 Method: Manual
  Subnet: 192.168.18.0/24
  Address: 192.168.18.102
  Gateway: 192.168.18.1
  Name servers: 192.168.18.1 (or 8.8.8.8)
```

**Proxy:** Leave empty

**Mirror:** Use default (archive.ubuntu.com)

**Storage:** Use an entire disk (select the 200GB disk)

**Profile Setup:**
```
Your name: k3s
Your server's name: k3s-0
Username: k3s
Password: (choose a strong password, save it!)
```

**SSH Setup:**
```
Install OpenSSH server: ✓ (checked)
Import SSH identity: No
```

**Featured Server Snaps:** Skip (don't select any)

4. Wait for installation to complete
5. Click **Reboot Now**
6. Remove the ISO: VM 102 → Hardware → CD/DVD → Edit → Do not use any media

### Step 4: Initial Server Configuration

SSH into the server (from your machine):
```bash
ssh k3s@192.168.18.102
```

Update the system:
```bash
sudo apt update && sudo apt upgrade -y
```

Install QEMU guest agent (for Proxmox integration):
```bash
sudo apt install -y qemu-guest-agent
sudo systemctl enable qemu-guest-agent
sudo systemctl start qemu-guest-agent
```

Install required packages:
```bash
sudo apt install -y curl wget git htop net-tools
```

Disable swap (required for Kubernetes):
```bash
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
```

Configure kernel modules for K8s:
```bash
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system
```

Reboot to apply all changes:
```bash
sudo reboot
```

### Step 5: Install K3s

SSH back into the server:
```bash
ssh k3s@192.168.18.102
```

Install K3s with HA-ready configuration:
```bash
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --disable traefik \
  --disable servicelb \
  --tls-san k3s.internal \
  --tls-san 192.168.18.102 \
  --tls-san 192.168.18.103 \
  --tls-san 192.168.18.104 \
  --kubelet-arg="max-pods=150"
```

Wait for K3s to start (~1-2 minutes):
```bash
# Check K3s status
sudo systemctl status k3s

# Verify kubectl works
sudo kubectl get nodes
```

Expected output:
```
NAME    STATUS   ROLES                       AGE   VERSION
k3s-0   Ready    control-plane,etcd,master   1m    v1.31.x+k3s1
```

### Step 6: Configure kubectl Access

On the K3s server, get the kubeconfig:
```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

Copy this file to your local machine. Save it as `~/.kube/k3s-config.yaml`.

Edit the copied file to replace `127.0.0.1` with the server IP:
```yaml
# Change this line:
server: https://127.0.0.1:6443
# To:
server: https://192.168.18.102:6443
```

Test from your local machine:
```bash
export KUBECONFIG=~/.kube/k3s-config.yaml
kubectl get nodes
```

### Step 7: Create Meeboter Namespace and Resources

This creates the `meeboter` namespace with its own ResourceQuota. Other projects can have their own namespaces.

Apply the namespace and quota:
```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: meeboter
  labels:
    app.kubernetes.io/name: meeboter
    project: meeboter
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: meeboter-quota
  namespace: meeboter
spec:
  hard:
    requests.cpu: "10"       # Reserve 10 CPU for meeboter
    requests.memory: "20Gi"  # Reserve 20GB for meeboter
    limits.cpu: "20"
    limits.memory: "40Gi"
    pods: "80"
EOF
```

Verify:
```bash
kubectl get namespace meeboter
kubectl describe quota meeboter-quota -n meeboter
```

**Note**: To add another project later, create a new namespace with its own quota:
```bash
kubectl create namespace project-b
# Then apply a ResourceQuota for project-b
```

### Step 8: Create GHCR Image Pull Secret

You need a GitHub Personal Access Token (PAT) with `read:packages` scope.

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with `read:packages` scope
3. Copy the token

Create the secret in the `meeboter` namespace:
```bash
# Replace YOUR_GITHUB_USERNAME and YOUR_PAT_TOKEN
kubectl create secret docker-registry ghcr-credentials \
  --namespace=meeboter \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USERNAME \
  --docker-password=YOUR_PAT_TOKEN
```

Verify:
```bash
kubectl get secret ghcr-credentials -n meeboter
```

**Note**: Each namespace that needs to pull from GHCR needs its own secret.

### Step 9: Deploy Image Pre-puller (Optional but Recommended)

This pre-pulls bot images to all nodes, speeding up deployments cluster-wide:
```bash
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: image-prepuller
  namespace: meeboter
spec:
  selector:
    matchLabels:
      app: image-prepuller
  template:
    metadata:
      labels:
        app: image-prepuller
    spec:
      imagePullSecrets:
        - name: ghcr-credentials
      initContainers:
        - name: prepull-google-meet
          image: ghcr.io/payme-works/meeboter-google-meet-bot:latest
          command: ["echo", "Image pulled"]
          resources:
            limits:
              memory: "64Mi"
              cpu: "50m"
        - name: prepull-zoom
          image: ghcr.io/payme-works/meeboter-zoom-bot:latest
          command: ["echo", "Image pulled"]
          resources:
            limits:
              memory: "64Mi"
              cpu: "50m"
        - name: prepull-teams
          image: ghcr.io/payme-works/meeboter-microsoft-teams-bot:latest
          command: ["echo", "Image pulled"]
          resources:
            limits:
              memory: "64Mi"
              cpu: "50m"
      containers:
        - name: pause
          image: registry.k8s.io/pause:3.9
          resources:
            limits:
              memory: "16Mi"
              cpu: "10m"
EOF
```

Watch image pull progress:
```bash
kubectl get pods -n meeboter -w
```

Wait until the pod shows `Running` status.

### Step 10: Verify Complete Setup

Run these commands to verify everything is working:

```bash
# Check node status
kubectl get nodes

# Check meeboter namespace
kubectl get all -n meeboter

# Check resource quota
kubectl describe quota meeboter-quota -n meeboter

# Check image pull secret
kubectl get secret ghcr-credentials -n meeboter

# Test creating a job (will succeed and verify API access)
kubectl create job test-bot --image=busybox -n meeboter -- echo "test"
kubectl get jobs -n meeboter
kubectl delete job test-bot -n meeboter
```

**Cluster overview**:
```bash
# See all namespaces
kubectl get namespaces

# Check cluster resources
kubectl top nodes  # (requires metrics-server)
```

### Step 11: Configure Milo Server Access

On the Coolify server (192.168.18.100), copy the kubeconfig:

```bash
# Create .kube directory
mkdir -p ~/.kube

# Copy kubeconfig from K3s server
scp k3s@192.168.18.102:/etc/rancher/k3s/k3s.yaml ~/.kube/k3s-config.yaml

# Edit to use correct IP
sed -i 's/127.0.0.1/192.168.18.102/g' ~/.kube/k3s-config.yaml

# Set permissions
chmod 600 ~/.kube/k3s-config.yaml
```

Test from Coolify server:
```bash
export KUBECONFIG=~/.kube/k3s-config.yaml
kubectl get nodes
```

### Troubleshooting

**K3s won't start:**
```bash
sudo journalctl -u k3s -f
```

**Cannot connect to cluster:**
```bash
# Check if K3s is running
sudo systemctl status k3s

# Check firewall
sudo ufw status
# If active, allow port 6443
sudo ufw allow 6443/tcp
```

**Image pull fails:**
```bash
# Check secret exists
kubectl get secret ghcr-credentials -n meeboter -o yaml

# Test pulling manually
kubectl run test --image=ghcr.io/payme-works/meeboter-google-meet-bot:latest -n meeboter --restart=Never
kubectl describe pod test -n meeboter
kubectl delete pod test -n meeboter
```

**Resource quota exceeded:**
```bash
kubectl describe quota meeboter-quota -n meeboter
```

---

## Implementation Checklist

### Phase 1: Infrastructure Setup

- [ ] Create Ubuntu 24.04 VM (ID: 102, name: `k3s-0`) in Proxmox
  - [ ] 20 CPU cores
  - [ ] 56 GB RAM
  - [ ] 200 GB SSD
  - [ ] Static IP: 192.168.18.102
  - [ ] Bridge network to LAN
- [ ] Install K3s with HA-ready configuration
  ```bash
  curl -sfL https://get.k3s.io | sh -s - server \
    --cluster-init \
    --disable traefik \
    --disable servicelb \
    --tls-san k3s.internal \
    --tls-san 192.168.18.102 \
    --tls-san 192.168.18.103 \
    --tls-san 192.168.18.104 \
    --kubelet-arg="max-pods=150"
  ```
- [ ] Configure DNS entry: k3s.internal → 192.168.18.102
- [ ] Export kubeconfig for Milo server access
- [ ] Create `meeboter` namespace with ResourceQuota (10 CPU, 20GB)
- [ ] Create GHCR image pull secret in `meeboter` namespace
- [ ] Deploy image pre-puller DaemonSet
- [ ] Verify kubectl access from Coolify CT (192.168.18.100)

### Phase 2: Code Implementation

- [ ] Add `@kubernetes/client-node` dependency to `apps/milo/package.json`
- [ ] Create `kubernetes-platform-service.ts`
- [ ] Update `platform-factory.ts` to support 'k8s' platform
- [ ] Add K8S_* environment variables to `apps/milo/src/env.ts`
- [ ] Add K8S_* variables to `apps/milo/.env.example`
- [ ] Implement all PlatformService methods
- [ ] Create `k8s-router.ts` for observability API
- [ ] Write unit tests for KubernetesPlatformService
- [ ] Run lint and typecheck

### Phase 3: Observability

- [ ] Install Prometheus + Grafana via Helm
  ```bash
  helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
  helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
  ```
- [ ] Deploy kube-state-metrics
- [ ] Create bot monitoring Grafana dashboard
- [ ] Configure alert rules for failure rate and capacity
- [ ] Update frontend bot details dialog with K8s status

### Phase 4: Testing & Validation

- [ ] Deploy test bot to K3s, verify full lifecycle
- [ ] Test status monitoring (pending → running → completed)
- [ ] Test failure handling (verify FATAL status on crash)
- [ ] Load test with 20-40 concurrent bots
- [ ] Verify TTL cleanup of completed jobs (5 min)
- [ ] Test graceful shutdown via stopBot()

### Phase 5: Documentation Refactoring

**IMPORTANT**: Do NOT just append new sections. Refactor and reorganize each documentation file for optimal readability and coherence. The goal is that someone reading any doc file understands the complete picture, not a patchwork of additions.

**Architecture Documentation (`ARCHITECTURE.md`):**
- [ ] Refactor deployment platforms section to present all 3 platforms (Coolify, AWS, K8s) uniformly
- [ ] Update diagrams to show K8s alongside existing platforms
- [ ] Reorganize to ensure K8s is naturally integrated, not bolted on
- [ ] Update platform factory description with all options

**Deployment Guide (`DEPLOYMENT.md`):**
- [ ] Restructure to present deployment options as first-class choices
- [ ] Create consistent sections for each platform:
  - [ ] Prerequisites
  - [ ] Environment variables
  - [ ] Setup steps
  - [ ] Troubleshooting
- [ ] Add decision guide: "Which platform should I use?"

**Environment Configuration:**
- [ ] Refactor `apps/milo/.env.example`:
  - [ ] Group variables by platform (COOLIFY_*, ECS_*, K8S_*)
  - [ ] Add clear section headers
  - [ ] Consistent commenting style
- [ ] Update `apps/milo/src/env.ts` with organized comments

**New Kubernetes Documentation:**
- [ ] Create `k8s/README.md`:
  - [ ] Manifest descriptions and purposes
  - [ ] Installation order and dependencies
  - [ ] Customization guide
- [ ] Create `docs/K8S_SETUP.md`:
  - [ ] Proxmox VM setup guide
  - [ ] K3s installation steps
  - [ ] Verification checklist
- [ ] Create `docs/K8S_TROUBLESHOOTING.md`:
  - [ ] Common issues and solutions
  - [ ] kubectl debugging commands
  - [ ] Log retrieval and analysis

**Development Rules (`CLAUDE.md`):**
- [ ] Refactor deployment platform sections for consistency
- [ ] Document tRPC nested routers pattern as a general pattern
- [ ] Update debugging section with K8s-specific patterns
- [ ] Ensure rules apply uniformly to all platforms

**API Documentation:**
- [ ] Document new nested router structure (`bots.k8s.*`, `bots.coolify.*`, `bots.aws.*`)
- [ ] Update database schema docs with new columns
- [ ] Ensure Platform tab is documented alongside existing tabs

### Phase 6: Production Readiness

- [ ] Document runbooks for common K8s operations
- [ ] Set up etcd backup (for future HA)
- [ ] Tune resource limits based on actual usage
- [ ] Enable DEPLOYMENT_PLATFORM=k8s in production
- [ ] Monitor and adjust capacity

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| K3s node failure | All K8s bots fail | Design for HA (add nodes later), Coolify as fallback |
| Image pull failures | Bot deployment fails | Image pre-puller DaemonSet, retry logic |
| Resource exhaustion | New bots can't start | ResourceQuota, monitoring alerts |
| Network issues (Milo → K8s) | Can't deploy bots | Same LAN, static IP, health checks |

---

## Success Criteria

1. **Functional**: Bots can be deployed, monitored, and stopped via K8s
2. **Parity**: K8s behavior matches AWS ECS (ephemeral, predictable)
3. **Observability**: Full visibility into job/pod status in frontend
4. **Capacity**: 40-80 concurrent bots on single node
5. **Reliability**: <1% deployment failure rate
6. **Scalability**: Can add nodes for 200-500+ bots

---

## Platform-Aware Monitoring Design

### Key Finding: Logging is Platform-Agnostic

The bot logging architecture does NOT depend on the deployment platform. Bots send logs via HTTP to Milo API regardless of where they run:

```
Bot Container (any platform) → HTTP → Milo API → LogBufferService → S3
```

**No changes needed to core logging pipeline.**

### What Works Without Changes

| Feature | Implementation | K8s Impact |
|---------|----------------|------------|
| Log streaming | Bot → POST /logs/stream → LogBufferService | ✅ No change |
| Log archival | LogArchivalService → S3 | ✅ No change |
| Heartbeats | Bot → POST /heartbeat | ✅ No change |
| Events | Bot → POST /events → Database | ✅ No change |
| Screenshots | Bot → POST /screenshots → S3 | ✅ No change |

### New: Platform Tab in Bot Details Dialog

A new **Platform tab** will show platform-specific information based on which platform deployed the bot.

#### Database Schema Change

```sql
-- Add to bots table
ALTER TABLE bots ADD COLUMN deployment_platform VARCHAR(20);  -- "coolify" | "aws" | "k8s" | "local"
ALTER TABLE bots ADD COLUMN platform_identifier VARCHAR(255); -- Job name, task ARN, slot UUID
```

#### Platform Tab: Coolify Bots

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Platform: Coolify                                                          │
│  ────────────────────────────────────────────────────────                  │
│                                                                             │
│  Pool Slot                                                                  │
│  ├─ Slot Name: pool-google-meet-003                                        │
│  ├─ Status: busy                                                           │
│  └─ Application UUID: abc123-def456-...                                    │
│                                                                             │
│  Container                                                                  │
│  ├─ Image: ghcr.io/payme-works/meeboter-google-meet-bot:latest            │
│  └─ Resource Limits: 1 CPU, 2GB RAM                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Platform Tab: Kubernetes Bots

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Platform: Kubernetes                                                       │
│  ────────────────────────────────────────────────────────                  │
│                                                                             │
│  Job Details                                                                │
│  ├─ Job Name: bot-123-1703260800000                                        │
│  ├─ Status: Running                                                         │
│  ├─ Start Time: 2025-12-22 14:30:00                                        │
│  └─ Node: k3s-0                                                            │
│                                                                             │
│  Pod Details                                                                │
│  ├─ Pod Name: bot-123-1703260800000-abc12                                  │
│  ├─ Phase: Running                                                         │
│  ├─ Container: bot (Running)                                               │
│  └─ Restarts: 0                                                            │
│                                                                             │
│  Resource Usage (live, refreshes every 10s)                                │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ CPU:    ████████░░░░░░░░░░░░  180m / 500m (36%)                       │ │
│  │ Memory: ██████████████░░░░░░  650Mi / 1Gi (63%)                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  K8s Events (last 10)                                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │ Time     │ Type   │ Reason    │ Message                               │ │
│  ├──────────┼────────┼───────────┼───────────────────────────────────────┤ │
│  │ 14:30:02 │ Normal │ Scheduled │ Successfully assigned to k3s-0       │ │
│  │ 14:30:05 │ Normal │ Pulled    │ Container image already present      │ │
│  │ 14:30:06 │ Normal │ Created   │ Created container bot                │ │
│  │ 14:30:06 │ Normal │ Started   │ Started container bot                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Platform Tab: AWS ECS Bots

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Platform: AWS ECS                                                          │
│  ────────────────────────────────────────────────────────                  │
│                                                                             │
│  Task Details                                                               │
│  ├─ Task ARN: arn:aws:ecs:us-east-1:123456789:task/meeboter/abc123         │
│  ├─ Status: RUNNING                                                         │
│  ├─ Task Definition: meeboter-google-meet-bot:5                            │
│  └─ Launch Type: FARGATE                                                   │
│                                                                             │
│  Container Details                                                          │
│  ├─ Name: bot                                                              │
│  ├─ Status: RUNNING                                                        │
│  └─ Exit Code: (running)                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### tRPC Endpoints for Platform Tab

Using nested routers under `bots` for platform-specific endpoints:

```typescript
// apps/milo/src/server/api/routers/bots/index.ts

export const botsRouter = router({
  // Existing bot endpoints...
  get: protectedProcedure.input(...).query(...),
  list: protectedProcedure.input(...).query(...),

  // Platform-specific child routers
  k8s: k8sRouter,       // api.bots.k8s.*
  coolify: coolifyRouter, // api.bots.coolify.*
  aws: awsRouter,       // api.bots.aws.*
});

// apps/milo/src/server/api/routers/bots/k8s-router.ts
export const k8sRouter = router({
  // api.bots.k8s.getJob
  getJob: protectedProcedure
    .input(z.object({ botId: z.number() }))
    .query(async ({ input, ctx }) => {
      const bot = await getBotWithPlatformInfo(input.botId, ctx.userId);
      if (bot.deploymentPlatform !== "k8s") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bot not deployed on K8s" });
      }

      const k8s = new KubernetesPlatformService();
      return k8s.getJob(bot.platformIdentifier);
    }),

  // api.bots.k8s.getMetrics
  getMetrics: protectedProcedure
    .input(z.object({ botId: z.number() }))
    .query(async ({ input, ctx }) => {
      const bot = await getBotWithPlatformInfo(input.botId, ctx.userId);
      if (bot.deploymentPlatform !== "k8s") return null;

      const k8s = new KubernetesPlatformService();
      return k8s.getMetrics(bot.platformIdentifier);
    }),

  // api.bots.k8s.getEvents
  getEvents: protectedProcedure
    .input(z.object({ botId: z.number(), limit: z.number().default(10) }))
    .query(async ({ input, ctx }) => {
      const bot = await getBotWithPlatformInfo(input.botId, ctx.userId);
      if (bot.deploymentPlatform !== "k8s") return [];

      const k8s = new KubernetesPlatformService();
      return k8s.getEvents(bot.platformIdentifier, input.limit);
    }),
});

// apps/milo/src/server/api/routers/bots/coolify-router.ts
export const coolifyRouter = router({
  // api.bots.coolify.getSlot
  getSlot: protectedProcedure
    .input(z.object({ botId: z.number() }))
    .query(async ({ input, ctx }) => {
      const bot = await getBotWithPlatformInfo(input.botId, ctx.userId);
      if (bot.deploymentPlatform !== "coolify") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bot not deployed on Coolify" });
      }

      return getSlot(bot.platformIdentifier);
    }),
});

// apps/milo/src/server/api/routers/bots/aws-router.ts
export const awsRouter = router({
  // api.bots.aws.getTask
  getTask: protectedProcedure
    .input(z.object({ botId: z.number() }))
    .query(async ({ input, ctx }) => {
      const bot = await getBotWithPlatformInfo(input.botId, ctx.userId);
      if (bot.deploymentPlatform !== "aws") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bot not deployed on AWS" });
      }

      return getTask(bot.platformIdentifier);
    }),
});

// K8s details response type
interface K8sDetails {
  job: {
    name: string;
    status: "Pending" | "Running" | "Succeeded" | "Failed";
    startTime: string;
    completionTime?: string;
  };
  pod: {
    name: string;
    phase: string;
    nodeName: string;
    restarts: number;
    containerStatus: string;
  };
  events: Array<{
    time: string;
    type: "Normal" | "Warning";
    reason: string;
    message: string;
  }>;
}

interface K8sMetrics {
  cpu: {
    usage: string;   // "180m"
    limit: string;   // "500m"
    percent: number; // 36
  };
  memory: {
    usage: string;   // "650Mi"
    limit: string;   // "1Gi"
    percent: number; // 63
  };
}
```

### Frontend Implementation

```typescript
// apps/milo/src/app/bots/_components/platform-tab/platform-tab.tsx

interface PlatformTabProps {
  botId: number;
  deploymentPlatform: "k8s" | "coolify" | "aws" | "local";
}

export function PlatformTab({ botId, deploymentPlatform }: PlatformTabProps) {
  // Render platform-specific view based on deploymentPlatform from bot data
  switch (deploymentPlatform) {
    case "k8s":
      return <K8sPlatformView botId={botId} />;
    case "coolify":
      return <CoolifyPlatformView botId={botId} />;
    case "aws":
      return <AWSPlatformView botId={botId} />;
    default:
      return <LocalPlatformView />;
  }
}

// K8s-specific view using nested router: api.bots.k8s.*
function K8sPlatformView({ botId }: { botId: number }) {
  // api.bots.k8s.getJob
  const { data: job, isLoading: jobLoading } = api.bots.k8s.getJob.useQuery(
    { botId },
    { refetchInterval: 10000 }
  );

  // api.bots.k8s.getMetrics
  const { data: metrics } = api.bots.k8s.getMetrics.useQuery(
    { botId },
    { refetchInterval: 10000 }
  );

  // api.bots.k8s.getEvents
  const { data: events } = api.bots.k8s.getEvents.useQuery(
    { botId, limit: 10 },
    { refetchInterval: 10000 }
  );

  if (jobLoading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <PlatformHeader platform="Kubernetes" />
      {job?.job && <JobCard job={job.job} />}
      {job?.pod && <PodCard pod={job.pod} />}
      {metrics && <ResourceUsageCard metrics={metrics} />}
      {events && events.length > 0 && <K8sEventsTable events={events} />}
    </div>
  );
}

// Coolify-specific view using nested router: api.bots.coolify.*
function CoolifyPlatformView({ botId }: { botId: number }) {
  // api.bots.coolify.getSlot
  const { data: slot, isLoading } = api.bots.coolify.getSlot.useQuery(
    { botId },
    { refetchInterval: 10000 }
  );

  if (isLoading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <PlatformHeader platform="Coolify" />
      {slot && <SlotCard slot={slot} />}
    </div>
  );
}

// AWS-specific view using nested router: api.bots.aws.*
function AWSPlatformView({ botId }: { botId: number }) {
  // api.bots.aws.getTask
  const { data: task, isLoading } = api.bots.aws.getTask.useQuery(
    { botId },
    { refetchInterval: 10000 }
  );

  if (isLoading) return <Skeleton />;

  return (
    <div className="space-y-6">
      <PlatformHeader platform="AWS ECS" />
      {task && <TaskCard task={task} />}
    </div>
  );
}
```

### Monitoring Configuration Summary

| Setting | Value |
|---------|-------|
| Platform tab refresh | 10 seconds (for active bots) |
| K8s metrics refresh | 10 seconds |
| K8s events displayed | Last 10 |
| Resource usage display | Progress bars with percentage |

### Implementation Checklist Addition

Add to Phase 3 (Observability):

**Database Changes:**
- [ ] Add `deployment_platform` and `platform_identifier` columns to bots table
- [ ] Create database migration
- [ ] Update bot deployment to set platform fields on creation

**tRPC Nested Routers:**
- [ ] Create `apps/milo/src/server/api/routers/bots/k8s-router.ts`
  - [ ] `getJob` - Job/Pod details
  - [ ] `getMetrics` - CPU/RAM usage
  - [ ] `getEvents` - K8s events list
- [ ] Create `apps/milo/src/server/api/routers/bots/coolify-router.ts`
  - [ ] `getSlot` - Pool slot info
- [ ] Create `apps/milo/src/server/api/routers/bots/aws-router.ts`
  - [ ] `getTask` - ECS task info
- [ ] Update `apps/milo/src/server/api/routers/bots/index.ts` to include child routers

**KubernetesPlatformService Methods:**
- [ ] Implement `getJob()` - Job + Pod status
- [ ] Implement `getMetrics()` - Resource usage from Metrics API
- [ ] Implement `getEvents()` - K8s events for debugging

**Frontend Components:**
- [ ] Create `apps/milo/src/app/bots/_components/platform-tab/platform-tab.tsx`
- [ ] Create `K8sPlatformView` with Job, Pod, Resources, Events sections
- [ ] Create `CoolifyPlatformView` with Slot, Container sections
- [ ] Create `AWSPlatformView` with Task, Container sections
- [ ] Create `LocalPlatformView` (simple placeholder)
- [ ] Create `ResourceUsageCard` with progress bar visualization
- [ ] Create `K8sEventsTable` for events display
- [ ] Add Platform tab to bot details dialog tabs

**Testing:**
- [ ] Test K8s platform view with running bot
- [ ] Test Coolify platform view with pool slot
- [ ] Test AWS platform view (if ECS available)
- [ ] Test platform switching based on `deploymentPlatform` field
