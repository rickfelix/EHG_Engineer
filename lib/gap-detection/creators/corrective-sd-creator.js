/**
 * Corrective SD Auto-Creator
 *
 * Auto-creates strategic directives for critical/high severity gaps.
 * Only creates for gaps with confidence < 0.5.
 * Checks for existing SDs that cover the same scope before creating.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Create corrective SDs for critical/high severity gaps.
 * @param {Array} gaps - Classified gaps (with root_cause_category)
 * @param {string} parentSdKey - The parent SD key
 * @param {object} options - { dryRun: boolean }
 * @returns {Promise<{created: Array, skipped: Array, errors: Array}>}
 */
export async function createCorrectiveSDs(gaps, parentSdKey, options = {}) {
  const sb = getSupabase();
  const { dryRun = false } = options;

  const eligibleGaps = gaps.filter(g =>
    ['critical', 'high'].includes(g.severity) && g.confidence < 0.5
  );

  if (eligibleGaps.length === 0) {
    return { created: [], skipped: [], errors: [] };
  }

  const created = [];
  const skipped = [];
  const errors = [];

  for (const gap of eligibleGaps) {
    try {
      // Check for existing SD that covers this gap
      const existing = await findExistingSdForGap(sb, gap);
      if (existing) {
        gap.corrective_sd_key = existing.sd_key;
        skipped.push({
          requirement_id: gap.requirement_id,
          reason: 'existing_sd_covers_gap',
          existing_sd_key: existing.sd_key
        });
        continue;
      }

      if (dryRun) {
        created.push({
          requirement_id: gap.requirement_id,
          would_create: true,
          title: buildTitle(gap, parentSdKey)
        });
        continue;
      }

      // Create corrective SD
      const sdKey = buildSdKey(gap, parentSdKey);
      const { data: _data, error } = await sb.from('strategic_directives_v2').insert({
        sd_key: sdKey,
        title: buildTitle(gap, parentSdKey),
        status: 'draft',
        current_phase: 'LEAD',
        priority: gap.severity === 'critical' ? 'critical' : 'high',
        sd_type: 'bugfix',
        category: 'quality',
        description: buildDescription(gap, parentSdKey),
        strategic_objectives: JSON.stringify([{
          metric: 'Close gap for ' + gap.requirement_id,
          objective: `Implement missing requirement from ${parentSdKey}`,
          target: 'Gap resolved'
        }]),
        research_findings: JSON.stringify({
          source_gap_analysis: parentSdKey,
          requirement_id: gap.requirement_id,
          root_cause: gap.root_cause_category,
          original_severity: gap.severity,
          confidence: gap.confidence
        }),
        target_application: 'EHG_Engineer'
      }).select('sd_key');

      if (error) {
        errors.push({ requirement_id: gap.requirement_id, error: error.message });
        continue;
      }

      gap.corrective_sd_key = sdKey;
      created.push({ requirement_id: gap.requirement_id, sd_key: sdKey });
    } catch (err) {
      errors.push({ requirement_id: gap.requirement_id, error: err.message });
    }
  }

  return { created, skipped, errors };
}

async function findExistingSdForGap(sb, gap) {
  const keywords = gap.requirement.split(/\s+/).filter(w => w.length > 4).slice(0, 3);
  if (keywords.length === 0) return null;

  // Search for SDs with similar title/description
  const { data } = await sb
    .from('strategic_directives_v2')
    .select('sd_key, title, status')
    .not('status', 'in', '("completed","cancelled")')
    .limit(20);

  if (!data) return null;

  // Simple keyword match in title
  for (const sd of data) {
    const titleLower = sd.title.toLowerCase();
    const matchCount = keywords.filter(kw => titleLower.includes(kw.toLowerCase())).length;
    if (matchCount >= 2) return sd;
  }

  return null;
}

function buildSdKey(gap, _parentSdKey) {
  const reqId = gap.requirement_id.replace(/[^A-Z0-9-]/gi, '').slice(0, 10);
  return `SD-GAP-${reqId}-${Date.now().toString(36).slice(-4)}`.toUpperCase();
}

function buildTitle(gap, parentSdKey) {
  const reqShort = gap.requirement.slice(0, 80);
  return `Fix gap: ${reqShort} (from ${parentSdKey})`;
}

function buildDescription(gap, parentSdKey) {
  return `Corrective SD auto-created by gap detection analysis.

Source SD: ${parentSdKey}
Requirement: ${gap.requirement_id} - ${gap.requirement}
Gap Type: ${gap.gap_type}
Severity: ${gap.severity}
Root Cause: ${gap.root_cause_category}
Confidence: ${gap.confidence}

Evidence: ${gap.evidence}`;
}
