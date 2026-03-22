# EHG 3-Tier SLO Model

**Version**: 1.0.0
**SD**: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001

## Overview

Every EHG venture operates under a 3-tier Service Level Objective (SLO) model. The tier advances as the venture matures. SLO targets are stored in `venture_fundamentals.slo_targets` and enforced via monitoring.

## Tier 0: Infrastructure (All ventures from day zero)

Baseline infrastructure health. Applied automatically at venture creation.

| Metric | Target | Measurement |
|--------|--------|-------------|
| Uptime | >= 99.5% | Supabase status + Vercel/hosting uptime |
| API Response (p95) | < 500ms | Supabase Edge Functions / API routes |
| Database Availability | >= 99.9% | Supabase project health |
| Error Rate | < 1% | 5xx responses / total responses |
| SSL/TLS | Valid | Certificate expiry monitoring |
| Backup Frequency | Daily | Supabase automatic backups |

## Tier 1: MVP (Applied when venture reaches MVP deployment)

User-facing performance. Required before public launch.

| Metric | Target | Measurement |
|--------|--------|-------------|
| Largest Contentful Paint (LCP) | < 2.5s | Core Web Vitals (Lighthouse, CrUX) |
| Cumulative Layout Shift (CLS) | < 0.1 | Core Web Vitals |
| First Input Delay (FID) | < 100ms | Core Web Vitals |
| Time to Interactive (TTI) | < 3.5s | Lighthouse synthetic |
| Bundle Size (initial) | < 200KB gzipped | Build output analysis |
| Lighthouse Performance | >= 80 | Lighthouse CI |
| Auth Token Refresh | < 1s | Supabase Auth monitoring |

## Tier 2: Post-PMF (Custom per venture after product-market fit)

Venture-specific targets set by the venture team. Examples:

| Metric | Example Target | Notes |
|--------|---------------|-------|
| Concurrent Users | >= 1000 | Load testing baseline |
| Search Latency (p99) | < 200ms | Full-text search performance |
| Webhook Delivery | >= 99.9% | If applicable |
| Data Export Time | < 30s for 10k rows | If applicable |
| Real-time Latency | < 100ms | Supabase Realtime channels |

## SLO Target JSON Schema

Stored in `venture_fundamentals.slo_targets`:

```json
{
  "tier_0_infrastructure": {
    "uptime_pct": 99.5,
    "api_p95_ms": 500,
    "db_availability_pct": 99.9,
    "error_rate_pct": 1.0,
    "backup_frequency": "daily"
  },
  "tier_1_mvp": {
    "lcp_s": 2.5,
    "cls": 0.1,
    "fid_ms": 100,
    "tti_s": 3.5,
    "bundle_size_kb": 200,
    "lighthouse_perf": 80,
    "auth_refresh_s": 1.0
  },
  "tier_2_post_pmf": {}
}
```

## Tier Advancement Rules

1. **Tier 0 → Tier 1**: Automatic when venture `status` = 'mvp' or 'launched'
2. **Tier 1 → Tier 2**: Manual, set by venture team after PMF validation
3. **Tier never decreases**: Once at Tier 1, Tier 0 metrics still apply
4. **Violations**: Logged to `venture_compliance` with `check_type = 'slo_violation'`
