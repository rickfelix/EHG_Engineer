# Child A — Design Justification & Differentiation-Research Spike

**SD:** SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-A (data spine)
**Validation evidence:** sub_agent_execution_results `f2855298-15d7-4b0a-9fa3-c75b99abe5f4` (VALIDATION@LEAD)
**Migration:** `database/migrations/20260531180000_competitive_intelligence_spine.sql` (+ `_DOWN.sql`), DATABASE evidence `f8cc7fd5-01d5-4541-922c-0bee8b86977d` (EXEC, PASS 98)

---

## FR-6 — New tables vs. extending existing infrastructure (design justification)

The original design referenced a `competitor_tracking` table as "segment-keyed, no history." **That table does not exist** (validation-agent finding — the vision/arch wording was wrong). The real existing competitor infrastructure is:

| Table | What it is | Venture-scoped | History | Why not reused |
|-------|-----------|:---:|:---:|----------------|
| `competitors` | Roster of named competitors per venture (`analysis_data`, `swot`, `threat_level`, FK → `global_competitors`) | Yes | No (`uq_competitors_venture_name` blocks snapshot rows) | A *roster entry* is not the same object as a *compounding intelligence asset + history*. Extending it would require dropping its unique constraint and adding `snapshot_at`, conflating two concerns and risking the live roster. |
| `global_competitors` | Canonical competitor dedup registry, no analysis payload | No | No | Pure identity/dedup; no place for per-venture intelligence. **Referenced** by `competitor_intelligence.global_competitor_id` (FK) rather than duplicated. |
| `intelligence_analysis` | Generic venture-scoped agent results store (`agent_type`, `results`), 0 production rows | Yes (nullable) | Yes | No competitor identity columns (url/name), no differentiation/sanitization semantics. A purpose-built pair is clearer than overloading a generic store. |

**Decision:** create two purpose-built tables that *reference* the existing roster instead of duplicating it:

- **`competitor_intelligence`** — the compounding, operator-owned competitor-intelligence asset. **Operator-owned with an optional `venture_id`** because the Stage-0 teardown produces it *before* a venture exists; the venture link is attached on seed (Child B). Holds the synthesized payload plus the slots Children E/sanitization fill: `differentiation_strategy`, `differentiation_delta`, `sanitization_status`.
- **`ci_snapshots`** — point-in-time history (FK → `competitor_intelligence` ON DELETE CASCADE), with `diff_from_prior` for the on-demand refresh (Child D).

This adds the *intelligence-asset + history* layer on top of the existing *roster* layer — directly removing the fragmentation the feature targets, with **zero changes to any existing table** (additive + reversible; reversibility proved UP→DOWN-in-rollback→tables present).

**RLS:** mirrors the `competitors` pattern exactly — `service_role` ALL + `public` CRUD scoped to `venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid())`. Pre-seed records (`venture_id` NULL) are service-role-managed (server-side teardown writes) until linked to a venture, at which point operator ownership applies. No stricter/looser model than the existing tables was invented.

---

## FR-5 — Differentiation-research service-contract spike

**Question (chairman flag):** can the external `differentiation-research` FastAPI agent persist `venture_id`, and what are its cost/latency characteristics — is it load-bearing?

**Contract (from the codebase):** `ehg` → `VentureCompetitorResearch.tsx` → `differentiationResearchAPI` → `POST ${AGENT_PLATFORM_URL}/api/differentiation-research/analyze` (job submit) + poll. It is a **raw competitive-DATA** source (offerings/pricing/positioning), job/poll style.

**`venture_id` persistence:** resolved by this child, not by the external service. The canonical `competitor_intelligence` record carries `venture_id` (nullable) and `source` (`differentiation_research` is an allowed value). Any data the external agent returns is persisted *through the canonical layer* with the venture link, so end-to-end `venture_id` persistence does not depend on the external service's own storage.

**Cost / latency:** not load-bearing, so no blocking live benchmark was run. Per the architecture decision (arch v4), the **differentiation ENGINE is the internal automated Board-of-Directors deliberation** (`lib/brainstorm/*`, Child E) — which we own and whose feasibility is therefore resolved. The external service sits behind the data-layer abstraction as **one optional raw-data source** alongside the Stage-0 teardown worker; the data layer can substitute teardown-worker output without rework.

**Recommendation:** KEEP the external `differentiation-research` service as an *optional* raw-data input behind the canonical data layer. It is **not load-bearing** and introduces **no spike dependency** for the orchestrator. If it later becomes a primary source, run a live latency/cost benchmark at that point (Child E or a follow-up), gated behind the SSRF egress fetcher (CISO launch-blocker). No blocker for proceeding.
