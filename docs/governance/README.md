# Governance Documentation

## Overview

This directory contains governance-related documentation for the EHG platform, including constitutional rules, operational guidelines, and strategic intake policies.

## Contents

### Constitutional Frameworks

| Document | Description | Status |
|----------|-------------|--------|
| [Protocol Constitution Guide](protocol-constitution-guide.md) | 9 immutable rules governing the LEO Protocol self-improvement system | Approved |

### Operational Rules

| Document | Description | Status |
|----------|-------------|--------|
| [SD Anchor Ownership Rule](sd-anchor-ownership-rule.md) | Strategic Directive ownership and anchor assignment rules | Active |
| [Terminology Rules](terminology-rules.md) | Naming conventions and terminology standards | Active |
| [Strategic Intake Contract v1](strategic-intake-contract-v1.md) | Contract for strategic directive intake process | Active |

### Audit & Advisory

| Document | Description | Status |
|----------|-------------|--------|
| [Advisory Invocation Log](advisory-invocation-log.md) | Log of governance advisory invocations | Active |

---

## Related Governance Documentation

### Agent Governance (EVA System)

- **[EVA Manifesto](../doctrine/EVA_MANIFESTO_v1.md)** - Four Oaths and agent behavior governance
- **[Four Oaths Enforcement](../../lib/governance/four-oaths-enforcement.js)** - Technical enforcement of agent oaths

### Role-Based Governance

- **[Doctrine of Constraint](../../database/migrations/20251226_law1_doctrine_of_constraint_enforcement.sql)** - Database-level enforcement preventing EXEC agents from creating governance artifacts

### Venture Governance

- **[Genesis Oath v3](../vision/GENESIS_OATH_V3.md)** - Venture creation ceremony and simulation-to-reality workflow

---

## Governance Hierarchy

```
EVA MANIFESTO (All Agents)
    ├── Four Oaths (Transparency, Boundaries, Escalation, Non-Deception)
    └── Chain of Command (L1-L4)
        │
        ├── Protocol Constitution (Self-Improvement)
        │   └── 9 Immutable Rules (CONST-001 to CONST-009)
        │
        ├── Doctrine of Constraint (EXEC Limits)
        │   └── Database-level enforcement
        │
        └── Genesis Oath (Venture Creation)
            └── 25-stage validation workflow
```

---

## Contributing

When adding new governance documentation:

1. **Location**: Place in `docs/governance/` directory
2. **Naming**: Use kebab-case (e.g., `new-governance-rule.md`)
3. **Metadata**: Include metadata header with Category, Status, Version, Author, Last Updated, Tags
4. **Cross-References**: Link to related governance documents
5. **Update Index**: Add entry to this README

---

## Related Documentation

- **[Governance Library Guide](../reference/governance-library-guide.md)** - Technical implementation of governance modules
- **[Self-Improvement System Guide](../guides/self-improvement-system-guide.md)** - Self-improvement system overview
- **[Protocol Improvements CLI Guide](../cli/protocol-improvements-cli-guide.md)** - CLI commands for protocol management

---

*Last Updated: 2026-01-23*
*Maintained by: DOCMON Sub-Agent*
