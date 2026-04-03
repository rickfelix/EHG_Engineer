---
name: doc-audit
description: "Documentation health audit: score 13 dimensions (structural + coverage), persist results, generate corrective SDs, iterate until Grade A (≥93). Mirrors the /heal pattern."
tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
model: opus
---

# /doc-audit - Documentation Health Audit

Comprehensive documentation quality scoring across 13 dimensions with automatic corrective SD generation. Mirrors the `/heal` iterative pattern: score → persist → generate → re-score until Grade A (≥93).

## Instructions

When invoked (with or without arguments):

### Argument Routing

| Argument | Action |
|----------|--------|
| (none) | Run full pipeline: score → persist → generate if needed |
| `status` | Query latest persisted score from DB |
| `fix` or `generate` | Generate corrective SDs from latest score |
| `--verbose` | Show gap details during score |
| `--json` | Output machine-readable JSON (score subcommand only) |
| `--structural-only` | Skip D11-D13 coverage dimensions (offline-friendly) |

---

### Default Behavior (no arguments): Full Pipeline

```bash
node scripts/eva/doc-health-audit.mjs run --verbose
```

This automatically chains: **score → persist → generate corrective SDs**.

The `run` subcommand:
1. Scans all documentation files
2. Scores 13 dimensions (D01-D10 structural + D11-D13 coverage)
3. If Grade A (≥93): prints PASS signal and stops
4. If below Grade A: persists score to DB, generates corrective SDs grouped by tier
5. Outputs `DOC_AUDIT_STATUS` and `DOC_AUDIT_NEXT_CMD` signals

### Dimensions

| ID  | Dimension                 | Weight | Category   |
|-----|---------------------------|--------|------------|
| D01 | Location Compliance       | 10.5%  | Structural |
| D02 | Metadata Completeness     | 8.4%   | Structural |
| D03 | Naming Convention         | 5.6%   | Structural |
| D04 | Cross-Reference Integrity | 8.4%   | Structural |
| D05 | Content Freshness         | 7.0%   | Structural |
| D06 | Index Coverage            | 7.0%   | Structural |
| D07 | Structural Completeness   | 7.0%   | Structural |
| D08 | Database-First Compliance | 5.6%   | Structural |
| D09 | Orphan Detection          | 5.6%   | Structural |
| D10 | Duplicate Detection       | 4.9%   | Structural |
| D11 | Vision Coverage           | 10.0%  | Coverage   |
| D12 | Architecture Coverage     | 8.0%   | Coverage   |
| D13 | SD Documentation Coverage | 12.0%  | Coverage   |

### Signal Lines (Auto-Proceed Integration)

After the pipeline output, look for:

- `DOC_AUDIT_STATUS=PASS` → Grade A achieved. Done.
- `DOC_AUDIT_STATUS=NEEDS_CORRECTION` → Corrective SDs created. Continue after they execute.
- `DOC_AUDIT_SCORE_ID=<id>` → UUID of the persisted score record.
- `DOC_AUDIT_NEXT_CMD=<cmd>` → Machine-actionable next command (re-run after SDs complete).

### Iteration Loop

1. Run `/doc-audit` → scores, persists, generates corrective SDs
2. Corrective SDs appear in `npm run sd:next` queue
3. Execute the corrective SDs (fix docs)
4. Re-run `/doc-audit` → re-scores with improvements
5. Repeat until `DOC_AUDIT_STATUS=PASS` (Grade A ≥93)
6. **Safety limit: 10 rounds maximum**

---

### Score-Only (no persist/generate)

```bash
node scripts/eva/doc-health-audit.mjs score --verbose
```

### Structural-Only (offline, no DB)

```bash
node scripts/eva/doc-health-audit.mjs score --structural-only
```

### Status

```bash
node scripts/eva/doc-health-audit.mjs status
```

### Fix/Generate from Latest Score

```bash
node scripts/eva/doc-health-audit.mjs generate
```

## Related

- `/heal` — Codebase-vs-intent scoring (similar pattern)
- `/document audit` — Alias that routes here
- `npm run doc:audit` — CLI shortcut
