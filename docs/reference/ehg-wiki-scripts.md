---
Category: Reference
Status: Approved
Version: 1.0.0
Author: SD-LEO-INFRA-EHG-WIKI-DURABLE-001
Last Updated: 2026-07-08
Tags: ["ehg-wiki", "reference", "database"]
---

# EHG Wiki Scripts

Durable, structured, DB-backed knowledge base for the venture-building operation
(Karpathy "Wiki vs. Open Brain" framing — curated addressable knowledge stays
reliable; an LLM's in-context/in-memory recall fails precisely when leaned upon).

Source of truth is the `ehg_wiki_sections` table, modeled on the `leo_protocol_sections`
pattern that already generates `CLAUDE.md`. Generated human-readable docs live under
`docs/wiki/<domain>/<slug>.md` — never edit those directly, they are regenerated.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/wiki-section-upsert.js <domain> <slug> --title "T" --content @file.md [--ratified]` | Write/version a section. Auto-increments `version` when content actually changes; no-op on identical re-runs. |
| `scripts/query-ehg-wiki.js <domain> [--slug X \| --search Y]` | Agent-citable lookup. Returns a stable `citation_id` (e.g. `ehg_wiki_sections id=1`) or an explicit `NOT_FOUND` result — never fabricates. |
| `scripts/generate-ehg-wiki-docs.js [--domain <domain>]` | Regenerates `docs/wiki/<domain>/<slug>.md` from the DB. |

## Domains

`identity`, `ventures`, `factory`, `personas`, `governance` (DB CHECK constraint). Phase 1
(SD-LEO-INFRA-EHG-WIKI-DURABLE-001) seeded only `identity`, `ventures`, `factory`.
`personas` and `governance` are schema-ready but unseeded — deferred to a Phase 2 child SD.

## Why agents should use this instead of memory

When an agent needs to cite a specific, previously-verified fact (e.g. which MarketLens
venture row is canonical, or the EHG legal entity name), query the wiki and cite the
returned `citation_id` rather than asserting from in-context recall. This is the same
failure mode CLAUDE_LEAD.md already guards against by citing `leo_protocol_sections id=439`
instead of restating protocol text from memory.
