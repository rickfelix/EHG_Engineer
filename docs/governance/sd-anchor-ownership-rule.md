# SD Anchor Ownership Governance Rule

**Version:** 1.0
**Effective Date:** 2025-12-14
**Status:** ACTIVE
**Reference:** Phase B SD Split Carry-Forward Migration

---

## Rule: Single IMPLEMENT Owner Per Anchor Spec

**Exactly one SD may be the IMPLEMENT owner for a given anchor spec and overlapping section range. All other SDs sharing that anchor must be CONSUME or VERIFY_ONLY.**

### Anchor Role Definitions

| Role | Description | Responsibility |
|------|-------------|----------------|
| **IMPLEMENT** | Ownership claim | SD is responsible for implementing the spec's requirements |
| **VERIFY_ONLY** | Validation claim | SD verifies/validates the spec but does not implement |
| **CONSUME** | Consumer claim | SD consumes/targets the spec's defined state |

### Collision Rules

1. **IMPLEMENT vs IMPLEMENT** with overlapping sections = **COLLISION** (hard stop)
2. **IMPLEMENT vs VERIFY_ONLY** = **ALLOWED** (verifier doesn't own)
3. **IMPLEMENT vs CONSUME** = **ALLOWED** (consumer doesn't own)
4. **Non-overlapping sections** = **ALLOWED** (different scope)

### Per-Anchor Role Assignment

Roles can be assigned at:
1. **SD level** via `metadata.anchor_role` (applies to all anchors)
2. **Per-anchor level** via `metadata.anchor_role_overrides` (overrides SD-level for specific anchors)

Example:
```json
{
  "anchor_role": "IMPLEMENT",
  "anchor_role_overrides": {
    "06-hierarchical-agent-architecture.md": "CONSUME"
  }
}
```

### Current Vision V2 Anchor Ownership Matrix

| Anchor Spec | IMPLEMENT Owner | VERIFY/CONSUME |
|-------------|-----------------|----------------|
| `01-database-schema.md` | SD-VISION-V2-001 | V2-007 (VERIFY), V2-008 (CONSUME) |
| `02-api-contracts.md` | SD-VISION-V2-002 | V2-007 (VERIFY) |
| `03-ui-components.md` | SD-VISION-V2-006 | — |
| `04-eva-orchestration.md` | SD-VISION-V2-003 | V2-007 (VERIFY) |
| `06-hierarchical-agent-architecture.md` | SD-VISION-V2-004 | SD-V2-005 (CONSUME) |
| `09-agent-runtime-service.md` | SD-VISION-V2-005 | — |

### Exception Process

Any exception to the single-IMPLEMENT-owner rule requires:
1. Explicit per-anchor override in SD metadata with documented rationale
2. Chairman approval
3. Documentation in this governance file

---

## Enforcement

- **Migration Tool**: `scripts/migrate-child-sds.mjs` blocks patch apply on IMPLEMENT collisions
- **Audit Tool**: `scripts/audit-child-sds.mjs` validates anchor ownership
- **Hardcoded Overrides**: `ANCHOR_ROLE_OVERRIDES` in `migrate-child-sds.mjs` (migrate to metadata long-term)

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2025-12-14 | 1.0 | Initial rule established during Phase B carry-forward migration |

---

*Governance document for SD anchor ownership enforcement*
