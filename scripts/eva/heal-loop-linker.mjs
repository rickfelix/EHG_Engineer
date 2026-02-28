/**
 * heal-loop-linker.mjs — Back-link corrective SDs to their origin heal scores
 *
 * Closes the heal loop for corrective SDs created outside generateCorrectiveSD().
 */

/**
 * Find non-accept heal scores that have no generated_sd_ids (unlinked).
 */
export async function findUnlinkedScores(supabase) {
  const { data, error } = await supabase
    .from('eva_vision_scores')
    .select('id, sd_id, total_score, threshold_action, rubric_snapshot')
    .not('sd_id', 'is', null)
    .in('threshold_action', ['escalate', 'gap_closure_sd', 'minor_sd'])
    .is('generated_sd_ids', null)
    .order('scored_at', { ascending: false });

  if (error) throw new Error(`Failed to query unlinked scores: ${error.message}`);
  return (data || []).map(s => ({
    scoreId: s.id,
    sdKey: s.sd_id,
    score: s.total_score,
    action: s.threshold_action,
    gaps: s.rubric_snapshot?.gaps || [],
    summary: s.rubric_snapshot?.summary || '',
  }));
}

/**
 * Find corrective SDs — children of heal orchestrators or SDs with corrective metadata.
 */
export async function findCorrectiveSDs(supabase) {
  // Get known heal orchestrator UUIDs
  const HEAL_ORCH_KEYS = [
    'SD-MAN-INFRA-VISION-HEAL-PLATFORM-001',
    'SD-LEO-INFRA-IMPROVE-STEP-LEAD-002',
  ];

  const { data: orchs } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .in('sd_key', HEAL_ORCH_KEYS);

  const orchUuids = (orchs || []).map(o => o.id);

  // Get children of heal orchestrators
  let children = [];
  if (orchUuids.length > 0) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, parent_sd_id, metadata, vision_origin_score_id')
      .in('parent_sd_id', orchUuids);

    if (error) throw new Error(`Failed to query corrective SDs: ${error.message}`);
    children = data || [];
  }

  // Also get SDs with vision_origin_score_id already set (for completeness)
  // and SDs with "Corrective" in title
  const { data: titled } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, parent_sd_id, metadata, vision_origin_score_id')
    .ilike('title', '%Corrective%');

  // Merge, deduplicate by id
  const seen = new Set();
  const all = [];
  for (const sd of [...children, ...(titled || [])]) {
    if (!seen.has(sd.id)) {
      seen.add(sd.id);
      all.push({
        uuid: sd.id,
        sdKey: sd.sd_key,
        title: sd.title,
        parentSdId: sd.parent_sd_id,
        metadataScoreId: sd.metadata?.score_id || null,
        alreadyLinked: !!sd.vision_origin_score_id,
      });
    }
  }
  return all;
}

/**
 * Build keyword tokens from an SD key for fuzzy matching.
 * e.g. "SD-EVA-FEAT-TOOL-POLICIES-001" → ["tool", "policies"]
 */
function extractKeywords(sdKey) {
  return sdKey
    .replace(/^SD-/, '')
    .replace(/-\d+$/, '')
    .split('-')
    .map(w => w.toLowerCase())
    .filter(w => w.length > 3 && !['feat', 'fix', 'infra', 'orch', 'learn', 'auto', 'system'].includes(w));
}

/**
 * Match unlinked scores to corrective SDs.
 */
export async function matchScoresToCorrectives(unlinked, correctives) {
  const matches = [];
  const unmatched = [];

  for (const score of unlinked) {
    // 1. Exact metadata.score_id match
    let match = correctives.find(c => c.metadataScoreId === score.scoreId && !c.alreadyLinked);
    let confidence = 'exact-metadata';

    if (!match) {
      // 2. Keyword overlap between original SD key and corrective SD title
      const keywords = extractKeywords(score.sdKey);
      let bestOverlap = 0;
      let bestCandidate = null;

      for (const c of correctives) {
        if (c.alreadyLinked) continue;
        const titleLower = c.title.toLowerCase();
        const overlap = keywords.filter(kw => titleLower.includes(kw)).length;
        // Require ≥2 keywords OR 1 keyword of 5+ chars (avoids false positives on short words)
        const minOverlap = keywords.length === 1 ? 1 : 2;
        if (overlap > bestOverlap && overlap >= minOverlap) {
          bestOverlap = overlap;
          bestCandidate = c;
        }
      }

      if (bestCandidate) {
        match = bestCandidate;
        confidence = `keyword-${bestOverlap}`;
      }
    }

    if (match) {
      matches.push({
        scoreId: score.scoreId,
        originalSdKey: score.sdKey,
        score: score.score,
        action: score.action,
        correctiveSdKey: match.sdKey,
        correctiveUuid: match.uuid,
        correctiveTitle: match.title,
        confidence,
      });
    } else {
      unmatched.push(score);
    }
  }

  return { matches, unmatched };
}

/**
 * Persist the forward+backward links to DB.
 */
export async function applyLinks(matches, supabase) {
  let linked = 0;
  let failed = 0;

  for (const m of matches) {
    // Forward link: eva_vision_scores.generated_sd_ids ← corrective SD UUID
    const { error: e1 } = await supabase
      .from('eva_vision_scores')
      .update({ generated_sd_ids: [m.correctiveUuid] })
      .eq('id', m.scoreId);

    if (e1) {
      console.error(`  Failed forward link ${m.scoreId}: ${e1.message}`);
      failed++;
      continue;
    }

    // Backward link: strategic_directives_v2.vision_origin_score_id ← score UUID
    const { error: e2 } = await supabase
      .from('strategic_directives_v2')
      .update({ vision_origin_score_id: m.scoreId })
      .eq('id', m.correctiveUuid);

    if (e2) {
      console.error(`  Failed backward link ${m.correctiveSdKey}: ${e2.message}`);
      failed++;
      continue;
    }

    linked++;
  }

  return { linked, failed };
}
