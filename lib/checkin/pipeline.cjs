/**
 * Check-in step pipeline runner (SD-ARCH-HOTSPOT-CHECKIN-001).
 *
 * Step contract: { name: string, applies(ctx)?: boolean, run(ctx): Promise<object|undefined> }
 *   - `name`     identifies the step (registry order is documented in lib/checkin/steps/index.cjs).
 *   - `applies`  OPTIONAL sync predicate; when present and falsy for this ctx, the step is skipped.
 *   - `run`      does the work. A TRUTHY return short-circuits the pipeline (it becomes the
 *                check-in resolution object); a falsy return falls through to the next step.
 *
 * The runner has NO try/catch by design: each extracted rung carries its own fail-open
 * try/catch exactly as it did inline in resolveCheckin, and anything a step genuinely
 * throws must propagate to the caller exactly as it did before the extraction.
 */
async function runSteps(steps, ctx) {
  for (const step of steps) {
    if (!step.applies || step.applies(ctx)) {
      const r = await step.run(ctx);
      if (r) return r;
    }
  }
  return undefined;
}

module.exports = { runSteps };
