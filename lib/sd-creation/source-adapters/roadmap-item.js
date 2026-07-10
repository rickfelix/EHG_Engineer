/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: roadmap-item source adapter — createFromRoadmapItem,
 * persistLaneFailSoft and buildPromotionRepoOverrides moved VERBATIM from
 * scripts/leo-create-sd.js. Sanctioned change only: former hard-exit sites return
 * {ok:false, error, exitCode} (exit 1) / {ok:true, done:true} (exit 0); the CLI maps them
 * back to the historical exit codes.
 */
import { supabase } from '../context.js';
import { generateSDKey, SD_SOURCES } from '../../../scripts/modules/sd-key-generator.js';
// SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001: pure register-first helpers (FR-1 roadmap-item
// derivation, FR-3 two-way stamp payload, FR-4 lane via the shipped router).
import {
  deriveSdFieldsFromRoadmapItem,
  buildTwoWayStamp,
  laneForRoadmapItem,
} from '../../sourcing-engine/register-first.js';
import { createSDOrThrow as createSD } from '../pipeline.js';

// SD-LEO-INFRA-SOURCING-ENGINE-REGISTER-FIRST-001 (FR-4): persist the routed lane, FAIL-SOFT against
// the DORMANT lane column. The PostgREST client reports an unknown/unapplied column as PGRST204
// ("Could not find the 'lane' column ... in the schema cache") — NOT the raw Postgres 42703 — so detect
// both, plus a "lane … column … exist" message fallback. Skip silently until the migration is applied.
async function persistLaneFailSoft(sb, item, lane) {
  if (!lane) return;
  const tryUpdate = async (table, match) => {
    const { error } = await sb.from(table).update({ lane }).match(match);
    if (error) {
      const msg = error.message || '';
      const absent = error.code === 'PGRST204' || error.code === '42703'
        || (/lane/i.test(msg) && /(column|exist)/i.test(msg));
      if (absent) { console.log(`   ℹ️  lane column not yet applied (dormant) — lane='${lane}' not persisted to ${table}`); return; }
      throw error;
    }
  };
  await tryUpdate('roadmap_wave_items', { id: item.id });
  if (item.source_type === 'conversion_ledger' && item.source_id) {
    await tryUpdate('conversion_ledger', { id: item.source_id });
  }
}

/**
 * Create an SD from a roadmap_wave_items row (FR-1, --from-roadmap-item). Promotes the item: creates
 * the SD, then atomically two-way stamps the linkage (FR-3) and persists the routed lane fail-soft
 * (FR-4). FR-5 hard guard: an already-promoted item never double-promotes. Mirrors the createFromFeedback
 * contract (--type / --title overrides, guardrail review flags).
 */
/**
 * SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001: compute the repo-routing overrides for a
 * promoted roadmap SD from a (already-validated, normalized) --target-repos list. Pure + exported.
 * The first repo is the primary target_application (drives EXEC/gate/branch repo resolution); the
 * full list is stamped to metadata.target_repos. Empty/missing → {} (createSD keeps its default).
 * @param {string[]|null|undefined} targetRepos
 * @returns {{ target_application?: string, target_repos?: string[] }}
 */
export function buildPromotionRepoOverrides(targetRepos) {
  if (!Array.isArray(targetRepos) || targetRepos.length === 0) return {};
  return { target_application: targetRepos[0], target_repos: targetRepos };
}

export async function createFromRoadmapItem(itemId, options = {}) {
  const { migrationReviewed = false, securityReviewed = false } = options;
  console.log(`\n🗺️  Creating SD from roadmap item: ${itemId}`);

  let item;
  const { data: exact } = await supabase
    .from('roadmap_wave_items').select('*').eq('id', itemId).maybeSingle();
  if (exact) {
    item = exact;
  } else {
    if (!/^[0-9a-f-]+$/i.test(itemId)) {
      console.error('Invalid roadmap item id (must be UUID hex characters):', itemId);
      // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
      return { ok: false, error: `Invalid roadmap item id (must be UUID hex characters): ${itemId}`, exitCode: 1 };
    }
    const { data: partial } = await supabase
      .rpc('exec_sql', { sql_text: `SELECT id FROM roadmap_wave_items WHERE id::text LIKE '${itemId}%' LIMIT 1` });
    const pid = partial?.[0]?.result?.[0]?.id;
    if (pid) {
      const { data } = await supabase.from('roadmap_wave_items').select('*').eq('id', pid).single();
      item = data;
    }
  }
  if (!item) {
    console.error('Roadmap item not found:', itemId);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: `Roadmap item not found: ${itemId}`, exitCode: 1 };
  }

  // FR-5 hard guard: an already-promoted item never double-promotes.
  if (item.promoted_to_sd_key) {
    console.log(`\n⚠️  Roadmap item already promoted to SD: ${item.promoted_to_sd_key}`);
    console.log('   Skipping to prevent a double-SD.\n');
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(0) — early-exit(0) success
    // semantics preserved via a done-result the CLI maps to exit 0.
    return { ok: true, done: true, exitCode: 0, message: `Roadmap item already promoted to SD: ${item.promoted_to_sd_key}` };
  }

  const fields = deriveSdFieldsFromRoadmapItem(item);
  const type = options.typeOverride || fields.type;
  const sdTitle = options.titleOverride || fields.title;
  const sdKey = await generateSDKey({ source: SD_SOURCES.LEO, type, title: sdTitle, venturePrefix: null });

  // SD-LEO-INFRA-PRODUCT-PROMOTION-TARGET-REPO-001: route the promoted SD to a product repo when
  // --target-repos is given (the PRIMARY repo → top-level target_application that branch-resolver/
  // repo-paths read to resolve EXEC/gates/branch onto rickfelix/ehg; the full list → metadata.target_repos).
  const repoOverrides = buildPromotionRepoOverrides(options.targetRepos);

  const sd = await createSD({
    sdKey,
    title: sdTitle,
    // SD-LEO-INFRA-PROMOTION-THIN-STUB-FIX-001: use the deriver's DISTINCT description/scope/intent
    // instead of cloning item.title into description (which produced title===description===scope stubs
    // the bare-shell detector flagged). A title-only item is now flagged via metadata.needs_enrichment.
    description: fields.description || item.title || sdTitle,
    scope: fields.scope,
    strategic_intent: fields.strategic_intent,
    type,
    priority: 'medium',
    rationale: `Promoted from roadmap_wave_items ${item.id} (register-first path).`,
    ...(repoOverrides.target_application ? { target_application: repoOverrides.target_application } : {}),
    metadata: {
      ...fields.metadata,
      ...(migrationReviewed ? { migration_reviewed: true } : {}),
      ...(securityReviewed ? { security_reviewed: true } : {}),
      ...(repoOverrides.target_repos ? { target_repos: repoOverrides.target_repos } : {}),
    },
  });

  // FR-3: atomic two-way stamp (written together so the linkage cannot drift). Fail-soft.
  try {
    const stamp = buildTwoWayStamp(item, sd.sd_key, null);
    await supabase.from('roadmap_wave_items').update(stamp.roadmap).eq('id', item.id);
    if (stamp.ledger) {
      await supabase.from('conversion_ledger').update(stamp.ledger).eq('id', item.source_id);
    }
    console.log(`   🔗 Two-way stamp: roadmap_wave_items.promoted_to_sd_key=${sd.sd_key}${stamp.ledger ? ' + conversion_ledger.linked_sd_key' : ''}`);
  } catch (e) {
    console.warn(`   ⚠️  Two-way stamp skipped (non-blocking): ${e.message}`);
  }

  // FR-4: route the lane via the shipped router, persist fail-soft (lane column ships DORMANT).
  try {
    const routed = laneForRoadmapItem(item);
    await persistLaneFailSoft(supabase, item, routed.lane);
  } catch (e) {
    console.warn(`   ⚠️  Lane persist skipped (non-blocking): ${e.message}`);
  }

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: the roadmap_wave_items id (string) or { itemId, options }.
 */
export async function toDraft(input, _deps = {}) {
  if (input && typeof input === 'object') {
    return createFromRoadmapItem(input.itemId ?? input.id, input.options ?? {});
  }
  return createFromRoadmapItem(input);
}
