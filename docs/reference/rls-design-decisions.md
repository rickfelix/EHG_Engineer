# RLS Design Decisions

## Single-Tenant Architecture

EHG uses a single-tenant database design where one Supabase project serves one organization. Row Level Security (RLS) exists for defense-in-depth, not multi-tenant isolation.

## Policy Patterns

| Pattern | Roles | Commands | Use Case |
|---------|-------|----------|----------|
| **OPEN** | authenticated | ALL | Core operational tables (ventures, stages, etc.) |
| **APPEND-ONLY** | authenticated | SELECT, INSERT | Audit/log tables — immutable records |
| **SERVICE-ONLY** | service_role | ALL | Internal system tables, empty/speculative tables |
| **READ-ONLY** | authenticated | SELECT | Reference data, configuration |

## Why USING(true) Is Acceptable

In a single-tenant design, `USING(true)` for authenticated users is the correct policy. There are no other tenants to isolate from. The primary security boundary is authentication itself (JWT verification), not row-level filtering.

Tables that need row-level filtering (e.g., venture-scoped data) use `USING(venture_id = ...)` or ownership checks.

## Phase 1 Changes (2026-03-17)

- 48 audit/log tables: OPEN → APPEND-ONLY (no UPDATE/DELETE for authenticated)
- 14 empty tables: OPEN → SERVICE-ONLY (locked until use case defined)
- Rationale: Audit immutability and least-privilege defaults

## Tables Excluded From Tightening

- `marketing_content_queue` — venture-scoped authenticated policy needed by app
- `capital_transactions` — already minimal (authenticated SELECT only)
- `venture_exit_profiles` — proper owner-scoped RLS (good pattern)
- `venture_asset_registry` — may need authenticated INSERT+SELECT for app functionality
