#!/usr/bin/env node
/**
 * FR-7 — read-only dry-mode evaluation of Stage 24's Launch Readiness checklist.
 * SD-LEO-INFRA-STAGE-LAUNCH-READINESS-001.
 *
 * analyzeStage23LaunchReadiness's only write fires on preflight FAILURE (a
 * stage_skipped eva_orchestration_events insert). This wrapper makes that path a
 * no-op so a run against a real venture is genuinely read-only regardless of
 * outcome -- every other call the analyzer makes is a plain SELECT.
 *
 * Usage:
 *   node scripts/eva/dry-run-stage24-checklist.mjs --venture-id <uuid>
 *   node scripts/eva/dry-run-stage24-checklist.mjs --venture-name "AltifyAI"
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { analyzeStage23LaunchReadiness } from '../../lib/eva/stage-templates/analysis-steps/stage-23-launch-readiness.js';

/**
 * Wraps a real supabase client so `.from('eva_orchestration_events').insert(...)`
 * is a no-op — every other table/method (including .rpc, which lives on the
 * client's prototype and would be silently lost by an object-spread copy)
 * passes through untouched via Reflect against the real client.
 * @param {object} supabase
 * @returns {object}
 */
export function withReadOnlyEventsGuard(supabase) {
  const originalFrom = supabase.from.bind(supabase);
  return new Proxy(supabase, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return (table) => {
          if (table === 'eva_orchestration_events') {
            return { insert: async () => ({ data: null, error: null }) };
          }
          return originalFrom(table);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

async function resolveVentureId({ supabase, ventureId, ventureName }) {
  const query = supabase.from('ventures').select('id, name').limit(1);
  const { data, error } = await (ventureId ? query.eq('id', ventureId) : query.ilike('name', ventureName)).maybeSingle();
  if (error) throw new Error(`venture lookup failed: ${error.message}`);
  if (!data) throw new Error(`no venture found matching ${ventureId ? `id '${ventureId}'` : `name '${ventureName}'`}`);
  return { id: data.id, name: data.name };
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      flags[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const ventureIdArg = flags['venture-id'];
  const ventureNameArg = flags['venture-name'];
  if (!ventureIdArg && !ventureNameArg) {
    console.error('Usage: node scripts/eva/dry-run-stage24-checklist.mjs --venture-id <uuid> | --venture-name "<name>"');
    process.exit(1);
  }

  const realSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { id: ventureId, name: ventureName } = await resolveVentureId({
    supabase: realSupabase,
    ventureId: ventureIdArg,
    ventureName: ventureNameArg,
  });

  const supabase = withReadOnlyEventsGuard(realSupabase);
  const result = await analyzeStage23LaunchReadiness({ supabase, ventureId, ventureName, logger: console });

  console.log(JSON.stringify({ dry_run: true, venture_id: ventureId, venture_name: ventureName, result }, null, 2));
  process.exit(0);
}

if (process.argv[1] && process.argv[1].endsWith('dry-run-stage24-checklist.mjs')) {
  main().catch((err) => {
    console.error(`dry-run-stage24-checklist failed: ${err.message}`);
    process.exit(1);
  });
}
