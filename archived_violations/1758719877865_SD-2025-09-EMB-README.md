# SD-2025-09-EMB: EHG Message Bus Implementation Guide

## Overview
This Strategic Directive implements a durable RabbitMQ message bus for the **EHG application** (40-stage venture workflow), with all governance artifacts stored in the **EHG_Engineering database**.

## Migration Instructions

### 1. Apply Database Migration
```bash
# Using psql with DATABASE_URL from .env
psql $DATABASE_URL -f database/migrations/2025-09-EMB-message-bus.sql

# Or via Supabase Dashboard:
# 1. Navigate to SQL Editor at https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq
# 2. Paste contents of 2025-09-EMB-message-bus.sql
# 3. Execute
```

### 2. Verify Installation
```bash
# Run verification queries
psql $DATABASE_URL -f database/migrations/verify-SD-2025-09-EMB.sql

# Expected results:
# - 1 Strategic Directive (SD-2025-09-EMB)
# - 1 PRD (SD-2025-09-EMB-PRD)
# - 5 Epics with 55 total points
# - 16 Stories across all epics
# - Multiple tasks per story
```

### 3. Check Dashboard Integration
Access the LEO Protocol Dashboard at http://localhost:3000 and verify:
- SD-2025-09-EMB appears in Strategic Directives list
- PRD is linked and accessible
- Backlog items show correct hierarchy

## Key Artifacts

### Database Records Created
- **Strategic Directive**: `SD-2025-09-EMB` (UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
- **PRD**: `SD-2025-09-EMB-PRD` (UUID: b2c3d4e5-f6a7-8901-bcde-f23456789012)
- **Epics**: E1-EMB-INFRA through E5-EMB-ROLLOUT
- **Stories**: 16 stories with acceptance criteria
- **Tasks**: Granular implementation tasks

### Implementation Sequence
1. **Infrastructure** (Epic 1): Docker, vhost, feature flag
2. **Publishers** (Epic 2): Event contracts, agent publishers
3. **Consumers** (Epic 3): Idempotency, retry/DLQ
4. **Observability** (Epic 4): OTel, metrics, dashboards
5. **Rollout** (Epic 5): Shadow mode → Production

### Critical Configuration
- **Exchange**: `ehg.events` (topic)
- **Vhost**: `/ehg` with least-privilege users
- **Feature Flag**: `FEATURE_MQ` for instant rollback
- **Idempotency**: `processed_events` table prevents duplicates

## Rollback Procedure
If issues arise, rollback is safe and immediate:

```bash
# 1. Toggle feature flag (instant)
export FEATURE_MQ=false

# 2. If needed, remove database artifacts
psql $DATABASE_URL -f database/migrations/rollback-SD-2025-09-EMB.sql
```

## Security Considerations
- TLS 1.3 for all RabbitMQ connections
- Separate credentials per service
- Vhost isolation (`/ehg`)
- Encrypted payloads for sensitive data

## Monitoring & Alerts
- **Metrics**: Publish/consume rates, queue depths, DLQ counts
- **Traces**: Full message flow with correlation IDs
- **Alerts**: DLQ > 100 messages, consumer lag > 1000
- **Dashboard**: Grafana at :3001 (when deployed)

## Dependencies
- RabbitMQ 3.12+
- OpenTelemetry SDK
- Docker/docker-compose
- Feature flag system (env-based initially)

## Contact
- **Owner**: Chairman
- **Technical Lead**: Platform Team
- **Target Release**: 2025.10

## Summary

This database-first approach provides complete governance for the EHG Message Bus initiative. The sequencing prioritizes infrastructure and safety (feature flags) first, then builds publishers before consumers to avoid message loss. Idempotency is critical and comes before scaling. Shadow mode allows risk-free validation before promotion. The database-driven approach enables automated reporting, agent coordination, and maintains clear boundaries between the governance system (EHG_Engineering) and the target application (EHG). Rollback is instant via feature flag, with full database cleanup available if needed. The architecture supports 10K messages/second with <100ms p50 latency and 99.9% uptime.