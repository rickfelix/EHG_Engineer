<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_vsweep.md -->
<!-- SD Key: SD-LEO-INFRA-VISION-CONSISTENCY-DOC-001 -->
<!-- Archived at: 2026-06-09T23:38:38.029Z -->

# Vision-consistency doc sweep: de-hardcode stage counts, supersede ADR-002, fix EHG-app naming, amend seed sources

## Type
infrastructure

## Priority
medium

## Objective
Reconcile the RESIDUAL documentation, EHG-app, and seed-source inconsistencies with the chairman-locked canonical EHG vision (2026-06-09) — the parts the in-flight P2 SD (SD-LEO-INFRA-INITIATIVE-BACKBONE-CANONICAL-001) does NOT cover. P2 fixes the live DB vision spine; this sweep cleans up everything else that still points at the retired framing or hardcodes superseded values. Findings from audit wrbp5zh14.

## Scope
- ADR-002 (docs/01_architecture/adr-002-venture-factory-architecture.md, status=APPROVED, reads as authoritative): add a SUPERSESSION banner pointing to the canonical vision + the venture_stages SSOT; de-hardcode the 25-stage references (it self-conflicts 25-vs-26; the live DB is 26 via migration 20260329); soften "System INFORMS decisions, never MAKES them" + decision_due_at time-boxing to the canonical govern-by-exception + AUTO-PROCEED model; mark the superseded proposed tables (lifecycle_stage_config, venture_stage_work, venture_artifacts as "(NEW)") as historical.
- STAGE-COUNT SWEEP: de-hardcode "25-stage"/"26-stage"/"40-stage" across the markdown corpus (docs/guides/workflow/cli-venture-lifecycle/*, the 25-stage-overview body+filename, docs/eva/stage-reference.md, venture-stage-governance.md) to reference the venture_stages SSOT ("the full venture lifecycle") rather than a literal number; fix the internally self-contradictory docs.
- CLAUDE phase files: CLAUDE_LEAD.md:1381 + CLAUDE_EXEC.md:1799/1810 say "25-Stage Insulation" while CLAUDE_ADAM.md:39 says "26-stage". Fix the leo_protocol_sections DB SOURCE and regenerate via scripts/generate-claude-md-from-db.js (never hand-edit generated files; CONST-005).
- EHG-APP NAMING (TIMING-COUPLED with P2's companies rename — must land AFTER/with P2 so it does not break default-company selection): CompanyContext.tsx:70,77 hardcodes "Executive Holdings Global" as the default-company lookup string (will MISS the row once P2 renames it); index.html:7,9,11 browser-tab/SEO/og title "Exec Holdings Group" (HIGHEST external visibility — the public social card); confirm _deprecated/landing/* is truly unrendered before ignoring.
- SEED-SOURCE AMENDMENT (so a re-provision does not re-inject the drift): scripts/eva/seed-l1-vision.js (+ brainstorm/topic-5-ehg-vision.md) carry the superseded L1 framing (mask / vessels / revenue-optional); the EHG portfolio seed migration re-creates the old company name. Update the seed SOURCES to the canonical vision + "ExecHoldings Global" (do NOT rewrite already-applied migrations; live rows are fixed by P2).
- kb/ehg-review historical vision docs (01_vision_ehg_eva.md, 00_foundations_ops_instructions.md — assert 40-stage / "acquisition from inception"): add a deprecated banner or archive.

## Acceptance Criteria
- ADR-002 carries a supersession banner and no live 25-vs-26 self-contradiction.
- Markdown stage-count references point at the SSOT, not a literal number; the CLAUDE phase files are internally consistent (regenerated from DB).
- The EHG-app default-company lookup + browser/social title read "ExecHoldings Global" (sequenced AFTER P2's rename).
- Seed sources updated; kb/ehg-review docs bannered/archived.

## Success Metrics
- Grep for "25-stage" / "Executive Holdings Global" / "Exec Holdings Group" returns only historical/archived/migration contexts.
- The public browser tab + social card read "ExecHoldings Global".

## Rationale
P2 fixes the live DB vision spine; this reconciles the residual internal docs, the public-facing EHG-app naming, and the seed sources that still point at the retired framing or hardcoded counts. None change live LEO behavior except the EHG-app naming, which is timing-coupled to P2. Depends on P2. Cross-repo (EHG + EHG_Engineer). See the canonical-vision audit (session 67b8df30 workflow wrbp5zh14) + docs/protocol/README.md.
