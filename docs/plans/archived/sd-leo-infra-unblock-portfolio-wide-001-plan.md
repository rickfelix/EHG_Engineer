<!-- Archived from: C:\Users\rickf\AppData\Local\Temp\_p3_compounding_fuel.md -->
<!-- SD Key: SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 -->
<!-- Archived at: 2026-06-09T16:13:44.881Z -->

# Unblock portfolio-wide compounding (land the never-executed SD-3 keystone)

## Type
infrastructure

## Priority
high

## Objective
Unblock venture-to-venture compounding (the chairman's core research ask) by landing the never-executed SD-3 keystone, so the existing-but-starved compounding libraries finally get real data. The flywheel is "trunk-complete and venture-empty"; this supplies the venture fuel.

## Scope
- Execute SD-3 (unify-venture-capabilities): add the `scope` dimension to `sd_capabilities` and POPULATE `venture_capabilities` (currently 0 rows) so `lib/governance/cross-venture-capability-graph.js` (present, reads an empty table today) gets real data; `v_unified_capabilities` gains venture rows.
- Lower/parameterize the venture template-extractor (`lib/eva/template-extractor.js`) Stage-25/26 gate so templates can extract from in-flight ventures (no venture has reached Stage 25). Begin populating the `ventures.source_blueprint_id` / `vision_id` / `architecture_plan_id` lineage (all 0/7 today).
- Turn on `issue_patterns.auto_block_on_match=true` for high-confidence patterns (currently only 1/1316) to shift from re-fix to prevent-at-gate.

## Acceptance Criteria
- `venture_capabilities` populated; `cross-venture-capability-graph.js` returns non-empty.
- Template-extractor can run before Stage 25; venture->blueprint->vision lineage begins populating.
- More than one high-confidence `issue_patterns` row set to `auto_block_on_match`.

## Success Metrics
- `venture_capabilities` row count > 0 and growing.
- `capability_reuse_log` > 0 rows.
- N high-confidence patterns auto-blocking at the gate.

## Rationale
SD-2 (capability scoring) and SD-4 (maturity-weighting) shipped, but SD-3 — the keystone giving them cross-venture reach — was never executed, so every portfolio consumer reads empty. The libraries already exist; the work is FUEL, not machinery. Build now and accept dormancy until real ventures mature (chairman-decided: only 7 ventures exist, none past Stage 25). Depends on P2 (Initiative/objective frame to roll up into). Schema change (scope column) — migration reviewed (chairman-authorized). See the performance-framework plan.
