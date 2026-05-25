/**
 * qf-resolution-link-advisory — FR-3 close-the-loop advisory hook
 * SD-LEO-INFRA-AUTO-CLOSE-QUICK-001
 *
 * After an SD completes, surface OPEN quick-fixes whose scope plausibly overlaps
 * this SD's — candidates the SD may have superseded. ADVISORY ONLY: it prints
 * suggestions + the exact link command and NEVER auto-links, prompts, or blocks.
 * Operator confirms by setting quick_fixes.resolution_sd_id (and, since the SD is
 * already completed, cancelling the QF) — see the printed command.
 */
import { findResolutionLinkCandidates } from '../../../../../../lib/qf/suggest-resolution-links.js';

/**
 * @returns {Promise<{outcome:string, detail?:string, candidates?:Array}>}
 */
export async function runQfResolutionLinkAdvisory(sd, supabase) {
  const candidates = await findResolutionLinkCandidates({ supabase, sd });
  if (!candidates.length) return { outcome: 'no_candidates' };

  const sdKey = sd.sd_key || sd.id;
  console.log(`   [qf-link-advisory] ${candidates.length} open QF(s) may be superseded by ${sdKey} (advisory — verify before linking):`);
  for (const c of candidates) {
    console.log(`      • ${c.id} (${c.severity}, overlap ${c.score}) — ${String(c.title).slice(0, 60)}`);
  }
  console.log(`      To link+close a confirmed match: node scripts/qf-link-resolution.mjs <QF-ID> ${sdKey}`);
  return { outcome: 'surfaced', detail: `${candidates.length} candidate(s)`, candidates };
}
