# AWS Cost Optimization Roadmap

> Created: 2025-12-27
> Status: ✅ Complete
> Goal: Reduce AWS ECS costs from ~$67/month to ~$50/month or lower

## Current State (After All Optimizations)

| Metric | Value |
|--------|-------|
| Architecture | ARM64 (Graviton2) |
| Spot Ratio | 100% Spot |
| Task Resources | 0.5 vCPU, 1 GB RAM |
| Cost per bot-hour | $0.00692 |
| Monthly cost (500 bots × 30min) | ~$52 |
| Savings vs x86 On-Demand | 76% |

### Optimizations Applied

- [x] ARM64 Graviton2 (20% cheaper than x86)
- [x] 100% Fargate Spot (70% cheaper than on-demand)
- [x] Right-sized CPU (0.5 vCPU)
- [x] Right-sized memory (1 GB)
- [x] No NAT Gateway (public subnets)
- [x] 1-day CloudWatch log retention
- [x] Container Insights enabled for monitoring

---

## Phase 2: Memory Optimization ✅ COMPLETE

### Objective
~~Determine if task memory can be reduced from 2GB to 1GB based on actual usage data.~~

**Status**: Applied on 2025-12-27. Memory reduced from 2GB to 1GB.

### Results
| Memory | Cost/Hour | Monthly (500×30min) | Savings |
|--------|-----------|---------------------|---------|
| 2 GB (previous) | $0.00893 | ~$67 | — |
| **1 GB (current)** | **$0.00756** | **~$57** | **~$10/mo** |

---

## Phase 3: Container Insights (Monitoring)

### Status
Container Insights remains **enabled** for ongoing monitoring of:
- Memory utilization (verify 1GB is sufficient)
- CPU utilization
- Task failures and OOM events

### Future Optimization
If monitoring confirms 1GB is sufficient after 7-14 days, consider disabling to save ~$3-5/month:
```hcl
setting {
  name  = "containerInsights"
  value = "disabled"
}
```

---

## Phase 4: Advanced Optimizations (Future)

### 4.1 Increase Spot to 100% (High Risk)

**Current**: 95% Spot / 5% On-Demand
**Proposed**: 100% Spot

| Metric | 95/5 | 100/0 |
|--------|------|-------|
| Cost/hour | $0.00893 | $0.00817 |
| Monthly | ~$67 | ~$61 |
| Risk | Low | Medium |

**Risk**: If Spot capacity unavailable, tasks fail to launch.
**Mitigation**: Only consider if Spot interruption rate < 5% over 30 days.

### 4.2 Reduce CPU to 0.25 vCPU (High Risk)

**Current**: 0.5 vCPU
**Proposed**: 0.25 vCPU

| CPU | Cost/Hour | Monthly | Risk |
|-----|-----------|---------|------|
| 0.5 vCPU | $0.00893 | ~$67 | Current |
| 0.25 vCPU | $0.00584 | ~$44 | High |

**Risk**: Browser automation (Playwright) is CPU-intensive. May cause:
- Slower page loads
- Timeout errors
- Meeting join failures

**Recommendation**: Only test if memory optimization successful first.

### 4.3 Region Arbitrage

AWS Fargate pricing varies by region. Current: us-east-2 (Ohio)

| Region | vCPU/hr | Potential Savings |
|--------|---------|-------------------|
| us-east-2 (current) | $0.01238 | — |
| us-east-1 | $0.01238 | 0% |
| us-west-2 | $0.01238 | 0% |
| eu-west-1 | Higher | N/A |

**Conclusion**: us-east-2 is already optimal for North America.

### 4.4 Reserved Capacity (Not Recommended)

AWS Savings Plans require commitment. Not suitable because:
- Bot usage is variable (500-2000/day fluctuations)
- Spot already provides 70% discount
- No benefit over Spot for ephemeral tasks

---

## Monitoring Commands

### Check Current Spot vs On-Demand Distribution
```bash
# List running tasks with capacity provider info
aws ecs describe-tasks \
  --cluster meeboter-bots \
  --tasks $(aws ecs list-tasks --cluster meeboter-bots --query 'taskArns' --output text) \
  --query 'tasks[].{taskArn:taskArn,capacityProvider:capacityProviderName,status:lastStatus}' \
  --region us-east-2
```

### Check Container Memory Usage (After Insights Enabled)
```bash
# View in AWS Console: CloudWatch > Container Insights > ECS > meeboter-bots
# Or use CLI after 24+ hours of data collection
```

### Check Spot Interruption History
```bash
# CloudWatch metric for Spot interruptions
aws cloudwatch get-metric-statistics \
  --namespace "AWS/ECS" \
  --metric-name "ServiceCount" \
  --dimensions Name=ClusterName,Value=meeboter-bots \
  --start-time $(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 86400 \
  --statistics Sum \
  --region us-east-2
```

---

## Cost Projection Summary

| Phase | Timeline | Monthly Cost | Cumulative Savings |
|-------|----------|--------------|-------------------|
| Baseline (x86 On-Demand) | — | $219 | — |
| Phase 1 (ARM64 + 95% Spot) | ✅ Done | $67 | $152/mo (69%) |
| Phase 2 (Memory 2GB→1GB) | ✅ Done | $57 | $162/mo (74%) |
| Phase 3 (100% Spot) | ✅ Done | $52 | $167/mo (76%) |
| Phase 4 (Disable Insights) | Future | $49 | $170/mo (78%) |

**Achieved**: Reduced from $219/month to ~$52/month = **76% savings** ✅

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-27 | Enabled Container Insights | Monitor memory/CPU usage |
| 2025-12-27 | Increased Spot to 95% | Safe optimization, ~$6/mo savings |
| 2025-12-27 | Reduced memory to 1GB | Aggressive optimization, ~$10/mo savings |
| 2025-12-27 | Increased Spot to 100% | Maximum savings, ~$5/mo more |

---

## Next Steps

- [ ] **Day 7** (2026-01-03): Check Container Insights for OOM errors or high memory usage
- [ ] **Day 14** (2026-01-10): If stable, consider disabling Container Insights
- [ ] **Monitor**: Watch for bot failures that might indicate memory pressure
