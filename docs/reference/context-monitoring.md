# Proactive Context Monitoring

**Generated**: 2025-10-28T21:47:56.039Z
**Source**: Database (leo_protocol_sections)
**Context Tier**: REFERENCE

---

**Context Monitoring**: Report context health in EVERY handoff.

**Status Thresholds**:
- HEALTHY ✅: 0-140K tokens (0-70%)
- WARNING ⚠️: 140K-180K (70-90%) - Consider compaction
- CRITICAL 🔴: 180K-190K (90-95%) - MUST compact before handoff
- EMERGENCY 🚨: >190K (>95%) - BLOCKED

**Handoff Section Required**:
```markdown
## Context Health
**Current Usage**: X tokens (Y% of 200K budget)
**Status**: HEALTHY/WARNING/CRITICAL
**Recommendation**: [action if needed]
```

**Complete Guide**: See `docs/reference/context-monitoring.md`

---

*This is reference documentation, load on-demand only*
*Generated from: scripts/generate-claude-md-from-db-v3.js*
