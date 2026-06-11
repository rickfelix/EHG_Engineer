<!-- Archived from: tmp/capability-plans/sd3-portfolio-graph.md -->
<!-- SD Key: SD-LEO-GEN-UNIFY-VENTURE-CAPABILITIES-001 -->
<!-- Archived at: 2026-05-29T14:09:08.642Z -->

# Plan: Unify SD and venture capabilities into a portfolio-wide capability graph

## Type
database

## Priority
medium

## Target Application
EHG_Engineer

## Summary
Capabilities are tracked in two disconnected systems. `sd_capabilities` holds per-SD engineering artifacts and is the registry Stage-0 discovery reads (currently 204 rows, all EHG_Engineer-internal). `venture_capabilities` holds venture-level reusable capabilities with `reusability_score`, `revenue_leverage_score`, `maturity_level`, `consumers`, and `integration_dependencies` (currently 0 rows, and not read by discovery). The bridge between them already exists in the schema but is unused: `venture_capabilities.origin_sd_key` links a venture capability to the SD that produced it, and `strategic_directives_v2` carries both `venture_id` and `target_application`, so a capability's scope (platform / application / venture) is derivable from its originating SD.

Today the de-facto scope of the capability ledger is "EHG_Engineer only" because that is all that has been registered. The portfolio cannot compound across ventures (CronGenius and successors) and applications when the graph only sees the trunk.

Goal: Establish a unified, portfolio-wide capability graph spanning platform (EHG_Engineer), applications, and ventures. Add an explicit scope dimension, formalize the `sd_capabilities` to `venture_capabilities` relationship via the SD-to-venture bridge, and populate `venture_capabilities` from completed venture SDs so cross-venture reuse (`cross-venture-capability-graph.js`) has data to operate on.

## Success Criteria
- [ ] Capability records carry an explicit scope dimension (platform | application | venture), derivable from the originating SD's `target_application` / `venture_id`.
- [ ] `sd_capabilities` and `venture_capabilities` are reconcilable via `origin_sd_key` / the SD bridge, documented and exposed through a unifying view.
- [ ] `venture_capabilities` is populated for at least the existing completed venture SDs (e.g. CronGenius) instead of 0 rows.
- [ ] A unified query or view returns capabilities across platform, application, and venture scopes.
- [ ] `cross-venture-capability-graph.js` returns non-empty results once `venture_capabilities` is populated.
- [ ] Discovery consumers can request capabilities filtered or weighted by scope.

## Scope
| File | Action | Purpose |
|------|--------|---------|
| `database/migrations/capability_scope_dimension.sql` | ADD | Add scope dimension and a unifying view across sd_capabilities and venture_capabilities |
| `lib/governance/cross-venture-capability-graph.js` | MODIFY | Consume the unified graph |
| `lib/capabilities/capability-taxonomy.js` | MODIFY | Resolve capability scope from the originating SD (target_application / venture_id) |
| `scripts/one-off/backfill-venture-capabilities.mjs` | ADD | Populate venture_capabilities from completed venture SDs |

Depends on SD-2 (capabilities must carry real scores before the unified graph is meaningful).
