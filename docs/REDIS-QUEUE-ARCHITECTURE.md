# Redis Queue Architecture

Complete guide to the distributed, queue-based scraping architecture.

---

## Overview

The QuintoAndar scraper uses **Redis queues** for distributed, resilient scraping:

**Phase 1 - Coordinator** (ID Discovery)
- Discovers all listing IDs
- Pushes to Redis queue
- Deduplicates globally

**Phase 2 - Workers** (Detail Fetching)
- Consume IDs from queue
- Fetch property details
- Send to Core Service
- Mark as processed

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: COORDINATOR                     │
│                                                             │
│  ┌──────────────┐                                          │
│  │ Coordinator  │  City-based OR Geo grid discovery        │
│  │  (1 process) │                                          │
│  └──────┬───────┘                                          │
│         │                                                   │
│         │ lpush (listing IDs)                              │
│         ▼                                                   │
│  ┌─────────────────────────────────────────────────┐       │
│  │             Redis Queue                         │       │
│  │  ┌────────────────────────────────────────┐    │       │
│  │  │ listing_queue: [id1, id2, id3, ...]   │    │       │
│  │  │ all_ids: Set {id1, id2, id3, ...}     │    │       │
│  │  │ processed_ids: Set {id1, id5, ...}    │    │       │
│  │  │ failed_ids: Set {id99, ...}           │    │       │
│  │  │ retries: Hash {id2: 1, id3: 2}        │    │       │
│  │  └────────────────────────────────────────┘    │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    PHASE 2: WORKERS                         │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Worker #1 │  │  Worker #2 │  │  Worker #3 │           │
│  │            │  │            │  │            │           │
│  │ brpop(id)  │  │ brpop(id)  │  │ brpop(id)  │           │
│  │     ↓      │  │     ↓      │  │     ↓      │           │
│  │ fetch()    │  │ fetch()    │  │ fetch()    │           │
│  │     ↓      │  │     ↓      │  │     ↓      │           │
│  │ transform()│  │ transform()│  │ transform()│           │
│  │     ↓      │  │     ↓      │  │     ↓      │           │
│  │ send()     │  │ send()     │  │ send()     │           │
│  │     ↓      │  │     ↓      │  │     ↓      │           │
│  │ sadd()     │  │ sadd()     │  │ sadd()     │           │
│  └────────────┘  └────────────┘  └────────────┘           │
│         │               │               │                  │
│         └───────────────┴───────────────┘                  │
│                         ▼                                   │
│              ┌──────────────────┐                          │
│              │  Core Service    │                          │
│              └──────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Redis Data Structures

### 1. **listing_queue** (List)

Pending listing IDs to be processed.

```redis
LLEN listing_queue        # Check queue depth
LPUSH listing_queue id1   # Add ID to queue (coordinator)
BRPOP listing_queue 5     # Pop ID from queue (worker, blocking 5s)
```

**Purpose**: FIFO queue for distributing work to workers

### 2. **all_ids** (Set)

All discovered listing IDs (for deduplication).

```redis
SCARD all_ids           # Total discovered
SISMEMBER all_ids id1   # Check if ID exists
SADD all_ids id1        # Add ID to set (coordinator)
```

**Purpose**: Global deduplication across discovery runs

### 3. **processed_ids** (Set)

Successfully processed listing IDs.

```redis
SCARD processed_ids           # Processed count
SISMEMBER processed_ids id1   # Check if processed
SADD processed_ids id1        # Mark as processed (worker)
```

**Purpose**: Track completed work, prevent re-processing

### 4. **failed_ids** (Set)

Permanently failed listing IDs (after max retries).

```redis
SCARD failed_ids           # Failed count
SMEMBERS failed_ids        # Get all failed IDs
SADD failed_ids id1        # Mark as failed (worker)
```

**Purpose**: Track failures for later analysis/retry

### 5. **retries** (Hash)

Retry count per listing ID.

```redis
HGET retries id1        # Get retry count
HINCRBY retries id1 1   # Increment retry count
HDEL retries id1        # Reset retry count
```

**Purpose**: Implement max retry logic (default: 3)

### 6. **stats** (Hash)

Scraping statistics.

```redis
HGET stats started_at            # When scraping started
HSET stats started_at timestamp  # Set start time
```

**Purpose**: Track scraping session metadata

---

## Workflow

### Phase 1: Discovery (Coordinator)

**City-Based Discovery** (73 cities):
```bash
npm run coordinator
```

**Geo Grid Discovery** (6,241 cells):
```bash
npm run coordinator:geo
```

**What happens**:
1. Coordinator fetches listing IDs from QuintoAndar API
2. For each ID:
   - Check if in `all_ids` set
   - If new: Add to `all_ids` set AND push to `listing_queue`
   - If exists: Skip (already queued)
3. Continue until all cities/cells processed
4. Exit

**Output**:
```
=== DISCOVERY COMPLETE ===
Cities processed: 73
Total discovered: 52,437
New IDs queued: 52,437
```

### Phase 2: Detail Fetching (Workers)

**Start workers** (run multiple in parallel):
```bash
# Terminal 1
npm run worker

# Terminal 2
npm run worker

# Terminal 3
npm run worker

# ... start as many as needed
```

**What happens**:
1. Worker calls `BRPOP listing_queue 5` (blocking pop, 5s timeout)
2. If ID received:
   - Check if in `processed_ids` (race condition check)
   - If not processed:
     - Fetch property details from yellow-pages endpoint
     - Transform to StandardProperty
     - Send to Core Service
     - Add to `processed_ids` set
   - If fetch fails:
     - Increment retry count in `retries` hash
     - If retries < 3: Re-queue with `LPUSH`
     - If retries ≥ 3: Add to `failed_ids` set
3. Rate limit delay (2-3 seconds)
4. Repeat

**Output** (per worker):
```
[worker-12345] Processed: 230, Failed: 3
[worker-12345] Queue empty, waiting...
```

---

## Commands

### Discovery

```bash
# Discover all 73 cities
npm run coordinator

# Discover entire Brazil (geo grid)
npm run coordinator:geo

# Custom grid size (0.25° = more granular)
GRID_SIZE=0.25 npm run coordinator:geo
```

### Workers

```bash
# Start single worker
npm run worker

# Start worker with custom ID
WORKER_ID=worker-01 npm run worker

# Start 5 workers in parallel (bash)
for i in {1..5}; do npm run worker & done
```

### Queue Management

```bash
# Show queue statistics
npm run queue:stats

# Show failed listings
npm run queue:show-failed

# Retry all failed listings
npm run queue:retry-failed

# Clear all queue data (DANGER!)
npm run queue:clear
```

---

## Queue Statistics

```bash
npm run queue:stats
```

**Output**:
```
=== QUEUE STATISTICS ===

Total Discovered:  52,437
Processed:         48,230 (91.98%)
Remaining:         4,207
Failed:            12
Queue Depth:       4,207
Started At:        2026-02-04T10:00:00Z
Elapsed Time:      3h 24m
Processing Rate:   235.44 listings/min
ETA:               2026-02-04T13:42:00Z (18m remaining)
```

---

## Benefits

### 1. **Persistence** ✅

Queue survives crashes:
```bash
# Coordinator discovers 50k IDs
npm run coordinator

# Ctrl+C (crash)

# Resume workers later - no data lost!
npm run worker
```

### 2. **Distributed Processing** ✅

Run multiple workers in parallel:
```bash
# 5 workers × 1 req/sec = 5 req/sec throughput
npm run worker &
npm run worker &
npm run worker &
npm run worker &
npm run worker &
```

**Performance**:
- Single worker: ~1,200 properties/hour
- 5 workers: ~6,000 properties/hour
- 10 workers: ~12,000 properties/hour

### 3. **Resumability** ✅

Stop and resume anytime:
```bash
# Stop worker
Ctrl+C

# Check progress
npm run queue:stats

# Resume later
npm run worker
```

### 4. **Observability** ✅

Real-time monitoring:
```bash
# Watch progress
watch npm run queue:stats

# Monitor failed listings
npm run queue:show-failed
```

### 5. **Deduplication** ✅

Global deduplication across:
- Multiple coordinator runs
- Multiple workers
- Crashed/restarted processes

### 6. **Fault Tolerance** ✅

Automatic retry with backoff:
- Failed fetch → Retry 1 (2s delay)
- Still failing → Retry 2 (4s delay)
- Still failing → Retry 3 (8s delay)
- Still failing → Mark as permanently failed

---

## Production Deployment

### Recommended Setup

**Single Coordinator** (discovers IDs):
```bash
# Run once to populate queue
npm run coordinator:geo
```

**Multiple Workers** (process details):
```bash
# Run on multiple machines/containers
# Machine 1
npm run worker

# Machine 2
npm run worker

# Machine 3
npm run worker
```

### Docker Compose Deployment

**Start the full stack:**
```bash
# Start Redis and workers
docker-compose up -d

# Run city coordinator (schedule every 6 hours with cron/k8s CronJob)
docker-compose run coordinator-city

# Run geo coordinator (schedule every 12 hours with cron/k8s CronJob)
docker-compose run coordinator-geo

# View worker logs
docker-compose logs -f worker

# Check queue stats
docker-compose run --rm stats
```

**Scheduling with Kubernetes CronJob:**
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: quintoandar-coordinator-city
spec:
  schedule: "0 */6 * * *"  # Every 6 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: coordinator
            image: landomo/scraper-brazil-quintoandar:latest
            command: ["npm", "run", "coordinator"]
            env:
            - name: REDIS_URL
              value: "redis://redis:6379"
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: quintoandar-coordinator-geo
spec:
  schedule: "0 */12 * * *"  # Every 12 hours
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: coordinator
            image: landomo/scraper-brazil-quintoandar:latest
            command: ["npm", "run", "coordinator:geo"]
            env:
            - name: REDIS_URL
              value: "redis://redis:6379"
```

**Scheduling with Docker + Cron:**
```bash
# Add to crontab
crontab -e

# City coordinator - every 6 hours
0 */6 * * * docker-compose -f /path/to/docker-compose.yml run --rm coordinator-city

# Geo coordinator - every 12 hours
0 */12 * * * docker-compose -f /path/to/docker-compose.yml run --rm coordinator-geo
```

---

## Monitoring & Alerts

### Queue Depth Alert

```bash
# Alert if queue grows too large (coordinator faster than workers)
depth=$(redis-cli LLEN landomo:quintoandar:queue)
if [ $depth -gt 100000 ]; then
  echo "ALERT: Queue depth $depth - start more workers!"
fi
```

### Processing Rate Monitor

```bash
# Check processing rate
npm run queue:stats | grep "Processing Rate"
```

### Failed Listings Alert

```bash
# Alert if failures exceed threshold
failed=$(redis-cli SCARD landomo:quintoandar:failed)
if [ $failed -gt 100 ]; then
  echo "ALERT: $failed failed listings - investigate!"
fi
```

---

## Troubleshooting

### Queue not emptying

**Problem**: Workers can't keep up with coordinator

**Solution**: Start more workers
```bash
for i in {1..10}; do npm run worker & done
```

### Too many failed listings

**Problem**: API issues, rate limiting, or bad data

**Solution**:
1. Check failed listings: `npm run queue:show-failed`
2. Investigate errors in logs
3. Retry after fixing: `npm run queue:retry-failed`

### Redis connection errors

**Problem**: Redis not running or wrong URL

**Solution**:
```bash
# Check Redis
redis-cli ping

# Update .env
REDIS_URL=redis://localhost:6379
```

### Workers exit immediately

**Problem**: Queue is empty

**Solution**:
1. Run coordinator first: `npm run coordinator`
2. Then start workers: `npm run worker`

---

## Comparison: In-Memory vs Redis Queue

| Feature | In-Memory (Old) | Redis Queue (New) |
|---------|-----------------|-------------------|
| **Persistence** | ❌ Lost on crash | ✅ Survives crashes |
| **Resumability** | ❌ Restart from scratch | ✅ Resume where left off |
| **Distributed** | ❌ Single process | ✅ Multiple workers |
| **Deduplication** | ❌ Per-run only | ✅ Global across runs |
| **Observability** | ❌ No visibility | ✅ Real-time stats |
| **Scalability** | ❌ Single-threaded | ✅ Horizontal scaling |
| **Fault Tolerance** | ❌ Manual retry | ✅ Automatic retry |

---

## Best Practices

### 1. **Run Coordinator First**
```bash
# Always populate queue before starting workers
npm run coordinator
npm run worker
```

### 2. **Monitor Progress**
```bash
# Check stats periodically
watch -n 60 npm run queue:stats
```

### 3. **Start Workers Gradually**
```bash
# Start 1 worker, monitor, then scale
npm run worker

# If all good, add more
for i in {2..5}; do npm run worker & done
```

### 4. **Handle Failed Listings**
```bash
# Periodically check and retry
npm run queue:show-failed
npm run queue:retry-failed
```

### 5. **Clean Up After Scraping**
```bash
# Optional: Clear queue data after successful run
npm run queue:clear
```

---

## Future Enhancements

Potential improvements:

- [ ] Priority queue (important cities first)
- [ ] Dead letter queue (permanently failed)
- [ ] Worker heartbeats (detect stuck workers)
- [ ] Rate limiting per worker (Redis-based)
- [ ] Progress webhooks (notify on milestones)
- [ ] Batch processing (fetch multiple IDs per request)

---

**Queue-based architecture makes the scraper production-grade with distributed processing, fault tolerance, and observability.**
