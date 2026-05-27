## Summary

Implements **Children A + B + D** of `SD-LEO-INFRA-UNIFY-VENTURE-NON-001` — the structural unification of the `eva_vision_documents` writer pipeline. **Child C (lifecycle-bridge refusal gate) is held for a follow-up PR** that lands after concurrent session's `SD-LEO-INFRA-FLEET-WIDE-SUB-001` (CAPA-4) merges, per cross-session coordination on `lib/eva/lifecycle-sd-bridge.js`.

Closes the 28th-witness writer-consumer asymmetry at the **pipeline layer**:
- **Before**: two writers fed `eva_vision_documents` with vastly different quality bars — brainstorm-to-vision.mjs produced rich docs (217/217 non-venture docs); a 9-line Stage-1 stub writer at `lib/eva/eva-orchestrator.js:183-191` produced stubs (0/10 venture docs were rich)
- **After**: brainstorm-to-vision.mjs is the SINGLE rich-doc writer; storage-layer CHECK constraint enforces the rich shape; existing stubs preserved as recoverable `draft_seed` archive

## What ships in this PR

### Child A — Schema (3 micro-migrations)
- **A.1** (`20260527_unify_vision_pipeline_a1_status_draftseed.sql`): ALTER status CHECK to add `'draft_seed'`. Idempotent.
- **A.2** (`20260527_unify_vision_pipeline_a2_unique_venture_level_active.sql`): unique partial index on `(venture_id, level) WHERE venture_id IS NOT NULL AND status='active'`. **Deviation from brainstorm scope**: narrower filter (`AND status='active'`) prevents blocking legitimate upserts when a venture has both an archived stub AND a new active rich L2 (the post-Phase-0 transitional state). Original intent — prevent two ACTIVE L2 docs per venture — preserved. Pre-flight `DO` block RAISEs if duplicates exist before `CREATE INDEX`.
- **A.3** (`20260527_unify_vision_pipeline_a3_check_active_rich.sql`): partial-implication CHECK `(status != 'active' OR (extracted_dimensions IS NOT NULL AND char_length(content) > 500))`. Applied with `NOT VALID`. **Significant discovery**: 27 pre-existing NON-VENTURE rows violate the predicate (19 short stubs for non-venture vision_keys + 5 long-content rows with NULL extracted_dimensions + 1 L1 + 1 odd). Suggests a second stub-writer path for non-ventures still exists or was used historically. Out of scope for this SD; flagged as P1 follow-up.

### Child B — Data + stub-writer excision
- **B.1** (`scripts/one-off/_archive-stub-venture-l2-docs.mjs`): idempotent one-off; archived **10 stub venture L2 docs** (3 active + 7 draft) to `status='draft_seed'`. Guarded compare-and-set; re-runs are no-ops. Preserved-not-deleted so Child D can pre-load them as brainstorm seed context.
- **B.2** (`lib/eva/eva-orchestrator.js`): excised the 9-line Stage-1 stub L2 writer at lines 183-191. Per chairman risk acceptance (decision #3 from brainstorm `7a145f03`): full call-graph audit SKIPPED; partial-implication CHECK is the fail-loud safety net. After this commit, Stage-1 venture creation produces NO `eva_vision_documents` row until chairman runs `/brainstorm --venture <X>`.

### Child D — Intake queue extension
- **D.1+D.2+D.3** (`.claude/commands/brainstorm.md`): new `--seed-from=<status>` + `--venture <name>` flag pair. When both passed, Step 4.5b queries `eva_vision_documents` for the matching archived L2 row and pre-loads its content as additional brainstorm seed context. Surfaced to chairman as "Prior intake found for this venture..." with `seed_source` + `seed_vision_key` recorded in session metadata for traceability. Currently accepts `--seed-from=draft_seed`; extensible.

## Child C (NOT in this PR)

The lifecycle-bridge refusal gate (Child C) is intentionally deferred. It needs to land AFTER concurrent session's `SD-LEO-INFRA-FLEET-WIDE-SUB-001` (CAPA-4) merges because both modify `lib/eva/lifecycle-sd-bridge.js` (different sections — CAPA-4 touches sub-agent routing; Child C adds `assertVentureVisionReady` at lines 295+372 — should be clean rebase). Tracked for follow-up PR.

## Phase 0 spike (NOT in this PR)

Chairman runs `/brainstorm --venture CronGenius` as a real (not sacrificial) session. Validates the `brainstorm-to-vision.mjs` L213 venture-aware path (217 production runs against non-venture, 0 against venture) AND produces the real CronGenius L2 doc. Failure mode mild: `brainstorm_sessions.content` preserves chairman input even if L2 write breaks (re-runnable).

## Live DB state verified

```
SELECT COUNT(*) FROM eva_vision_documents
  WHERE status='active' AND venture_id IS NOT NULL
  AND (extracted_dimensions IS NULL OR char_length(content) < 500);
-- Returns 0 (Vision Success Criterion #1 met)
```

## Evidence trail

- Brainstorm session: `7a145f03-3003-41b7-b061-9e1a6e0f630e` (quality 0.95, crystallization 0.85)
- Vision: `VISION-LEO-UNIFY-VISION-PIPELINE-L2-001` (id `6c360e17`, 9 dims, parent=WRITER-CONSUMER-ASYMMETRY)
- Arch plan: `ARCH-LEO-UNIFY-VISION-PIPELINE-001` (id `0e74668d`, 8 dims, quality 98/100)
- PRD: `PRD-SD-LEO-INFRA-UNIFY-VENTURE-NON-001` (approved)
- EXEC DATABASE evidence: `sub_agent_execution_results.id = efa7effa-0d8e-40e6-a38b-dc6849f3ddaf` (PASS, conf=95)

## Reframings (for other Claude Code session's SDs)

- `SD-LEO-INFRA-VISION-DOCUMENT-READINESS-001` (CAPA-2): scope-reduces to vision-scorer-structured-error + dedup-index only (defense-in-depth; no longer load-bearing)
- `SD-LEO-INFRA-LIFECYCLE-BRIDGE-ORCHESTRATOR-001` (CAPA-1 preventive): scope-reduces by dropping vision-check piece (this SD handles via DB constraint)
- **CAPA-3 (orchestrator-parent vision exemption) is OBSOLETE** under Option A. Do NOT file `SD-LEO-INFRA-ORCH-RUBRIC-EXPLICIT-001`.

## PR size justification (~232 LOC across 5 files + 4 new files)

Tier-3 ship — 4-child decomposition packed atomically for clean rollback semantics. Each child is logically separable (and committed as a separate commit in this PR) but the 4 are tightly sequenced: A.1 enables B.1; B.1 enables A.3 to apply cleanly to active rows; A.2/A.3 enable B.2 safety net; D closes the loop on B.1's archive. Splitting into 4 PRs would create intermediate states (e.g., B.1 archive without A.1's status enum = constraint violation; B.2 excision without A.3 = no safety net).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
