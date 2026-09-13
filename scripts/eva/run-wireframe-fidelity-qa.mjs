#!/usr/bin/env node
/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D (C3.2) — one-shot CLI wrapper invoking the
 * existing, unit-tested but never-yet-production-invoked
 * lib/eva/qa/stitch-wireframe-qa.js#scoreWireframeFidelity against a real venture.
 *
 * HONEST BY DESIGN: this script reports whatever status scoreWireframeFidelity actually
 * returns -- including 'no_screens', 'no_wireframes', or 'vision_api_unavailable' -- and
 * never fabricates a completed result. A live fleet-wide check (2026-09-13) found ZERO
 * ventures have ever produced a stitch_design_export artifact (the input
 * getExportedScreens() reads), so 'no_screens' is the EXPECTED outcome today for every
 * venture, AltifyAI included. That absence is itself the informational finding this
 * SD exists to surface (ratification 4730357d: "an honest AltifyAI kill can still
 * represent a successful factory test") -- building the missing stitch_design_export
 * producer is explicitly out of scope here.
 *
 * Usage:
 *   node scripts/eva/run-wireframe-fidelity-qa.mjs --venture-id <uuid> [--threshold <0-100>]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { scoreWireframeFidelity } from '../../lib/eva/qa/stitch-wireframe-qa.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2).replace(/-/g, '_');
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out[key] = val;
  }
  return out;
}

export async function run({ ventureId, threshold } = {}) {
  const result = await scoreWireframeFidelity(ventureId, threshold != null ? { threshold } : {});
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.venture_id) {
    console.error('Usage: node scripts/eva/run-wireframe-fidelity-qa.mjs --venture-id <uuid> [--threshold <0-100>]');
    process.exit(1);
  }

  // SECURITY finding SEC-LOW-2: a malformed --threshold (e.g. "abc") must not silently
  // become NaN, which would score every screen 'fail' rather than falling back to the
  // function's own default.
  let threshold;
  if (args.threshold) {
    threshold = Number(args.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      console.error(`Invalid --threshold '${args.threshold}': must be a finite number 0-100`);
      process.exit(1);
    }
  }

  // scoreWireframeFidelity resolves its own Supabase/Anthropic clients internally
  // (setSupabaseClientLoader/setAnthropicClientLoader are the injectable seams used by
  // tests) -- no client construction needed here for the real CLI path.
  const result = await run({
    ventureId: args.venture_id,
    threshold,
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(`[run-wireframe-fidelity-qa] status: ${result.status}`);
  if (result.status !== 'completed') {
    console.log(`[run-wireframe-fidelity-qa] no data was fabricated -- '${result.status}' is a real, honest outcome, not an error.`);
  }
}

main().catch((err) => {
  console.error('[run-wireframe-fidelity-qa] FATAL:', err.message);
  process.exit(1);
});
