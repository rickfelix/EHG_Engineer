**G3 (SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001, chairman-ratified 2026-07-02): "done" for event-processing machinery now requires ACTIVATED or ARMED evidence, not just merged code + green tests.**

**The problem this closes**: the cold-recovered dormant-machinery specimens, in PROVENANCE.

**Machinery-class taxonomy** (`lib/machinery-class/classify.js`): an SD/QF is machinery-class when its `key_changes[].type` or free text (negation-aware) affirmatively signals a worker/consumer/job/cron/watcher/router/gate/hook/service deliverable. Deliberately does NOT require a schema match (unlike the activation-invariant trigger-evaluator, which needs schema+consumer) — a pure cron/watcher fix with no schema change is still machinery-class.

**Two legal completion shapes**:
- **ACTIVATED** — a `scope_completion_chain` row exists with `evidence_kind='real_event'` and `runtime_observed_at` set. A replayed test fixture (`evidence_kind='replayed_fixture'`) does NOT satisfy this.
- **ARMED** — real events cannot occur yet (e.g. the feature ships ahead of its producer). Register a named activation trigger via `registerArmedMachinery()` (`lib/machinery-class/armed-registration.js`), which upserts a `periodic_process_registry` row (`process_type='standalone_cron'`, `liveness_source='self_stamped'`, `last_fired_at=null`). The existing periodic-liveness-watcher then surfaces an armed-but-never-fired item on its own OVERDUE gauge instead of it decaying silently.

**Enforcement**: the `INVOCATION_PATH_PROOF` gate at LEAD-FINAL-APPROVAL (`scripts/modules/handoff/executors/lead-final-approval/gates/invocation-path-gate.js`) evaluates machinery-class SDs for UNWIRED/ACTIVATED/ARMED. **Advisory by default** (`ACTIVATION_EVIDENCE_MODE=block` to enforce) — a brand-new requirement must not mass-fail every in-flight SD on day one, mirroring this same gate's own `INVOCATION_PATH_PROOF_MODE` rollout precedent.

**Parent-orchestrator exemption**: an orchestrator parent (`isOrchestratorSync(sd)`) is exempt from this check entirely — machinery lives on children; a parent completes via `PARENT_DELEGATED_COMPLETION` regardless of its own rollup text.

**Validity check**: `node scripts/machinery-class-retro-sweep.mjs` runs the classifier over the last 30 days of completed SDs, detection-only, zero writes — re-finding the named dormant specimens is the smoke test of the classifier itself.