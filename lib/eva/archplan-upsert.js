// lib/eva/archplan-upsert.js
/**
 * Reusable Architecture Plan upsert for EVA.
 * Extracted from scripts/eva/archplan-command.mjs to enable programmatic use
 * without CLI side effects.
 *
 * @module lib/eva/archplan-upsert
 */

import { assignDimensionIds } from './dimension-ids.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ArchplanUpsert');

export async function upsertArchPlan({ supabase, planKey, visionKey, content, sections: providedSections, dimensions, ventureId, brainstormId, createdBy = 'eva-archplan-upsert', approved = true }) {
  if (!supabase) throw new Error('supabase client is required');
  if (!planKey) throw new Error('planKey is required');
  if (!visionKey) throw new Error('visionKey is required');
  if (!content) throw new Error('content is required');

  // Resolve vision_id and version from vision_key
  const { data: visionDoc, error: visionErr } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, level, status, version, venture_id')
    .eq('vision_key', visionKey)
    .single();

  if (visionErr || !visionDoc) {
    return { data: null, error: visionErr || new Error(`Vision document not found: ${visionKey}`) };
  }

  // Determine version
  const { data: existing } = await supabase
    .from('eva_architecture_plans')
    .select('id, version, extracted_dimensions')
    .eq('plan_key', planKey)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;

  // SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001 (FR-3): assign stable ids only when the
  // caller actually supplied dimensions. Unlike vision-upsert.js, this function has no
  // carry-forward-on-omit behavior today (dimensions || null below) -- that is unchanged;
  // existing dimensions (by name) are reused so re-extraction preserves ids for names that
  // did not change.
  const dimensionsWithIds = Array.isArray(dimensions)
    ? assignDimensionIds(dimensions, existing?.extracted_dimensions || [])
    : dimensions;

  if (Array.isArray(dimensionsWithIds)) {
    const existingIds = new Set((existing?.extracted_dimensions || []).map((d) => d?.id).filter(Boolean));
    const freshCount = dimensionsWithIds.filter((d) => !existingIds.has(d.id)).length;
    logger.debug('Assigned dimension ids', { planKey, total: dimensionsWithIds.length, fresh: freshCount, reused: dimensionsWithIds.length - freshCount });
  }

  // Parse sections from markdown if not provided
  let sections = providedSections || null;
  if (!sections) {
    try {
      const sectionMap = {};
      const headingRegex = /^##\s+(.+)$/gm;
      const headings = [];
      let match;
      while ((match = headingRegex.exec(content)) !== null) {
        headings.push({ title: match[1].trim(), index: match.index + match[0].length });
      }
      for (let i = 0; i < headings.length; i++) {
        const start = headings[i].index;
        const end = i + 1 < headings.length ? headings[i + 1].index - headings[i + 1].title.length - 4 : content.length;
        const body = content.slice(start, end).trim();
        const key = headings[i].title
          .toLowerCase()
          .replace(/&/g, 'and')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');
        if (body.length > 0) {
          sectionMap[key] = body;
        }
      }

      // Try extracting implementation_phases (optional - module may not exist)
      try {
        const { parsePhases } = await import('../../scripts/create-orchestrator-from-plan.js');
        const phases = parsePhases(content);
        if (phases.length > 0) {
          sectionMap.implementation_phases = phases.map(p => ({
            number: p.number,
            title: p.title,
            description: p.description || '',
            child_designation: 'child',
            covered_by_sd_key: null,
            deliverables: [],
            estimate_loc: null
          }));
        }
      } catch {
        // Missing module is expected — implementation_phases is optional
      }

      const sectionCount = Object.keys(sectionMap).filter(k => k !== 'extracted_at' && k !== 'extraction_source').length;
      if (sectionCount > 0) {
        sections = {
          ...sectionMap,
          extracted_at: new Date().toISOString(),
          extraction_source: 'content_parse'
        };
      }
    } catch {
      // Non-blocking: sections population is best-effort
    }
  }

  // SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-1): approved !== false mirrors
  // vision-upsert.js's own default-true resolution (see that file's `approved` param) so
  // existing callers that omit this parameter keep today's exact behavior. chairman_approved_at
  // is stamped here for the first time -- it existed on the table but was never written.
  //
  // Disclosed downstream behavior change (VERIFY-phase REGRESSION review): now that some
  // callers pass approved:false and a plan can genuinely stay status='draft', two existing
  // readers that filter eva_architecture_plans on status='active' are, for the first time,
  // meaningfully gated by this rather than rubber-stamped: lib/eva/bridge/trust-elevation.js
  // (a live trust-tier AND-guard) and lib/eva/artifact-persistence-service.js's Stage-14 ADR
  // hook (degrades gracefully -- adr-extractor.js guards on architecturePlanId being
  // nullable, so ADRs still persist and only the plan back-link is skipped until promotion).
  const isApproved = approved !== false;

  const record = {
    plan_key: planKey,
    vision_id: visionDoc.id,
    vision_key: visionDoc.vision_key,
    vision_version_aligned_to: visionDoc.version || 1,
    content,
    extracted_dimensions: dimensionsWithIds || null,
    version,
    status: isApproved ? 'active' : 'draft',
    chairman_approved: isApproved,
    chairman_approved_at: isApproved ? new Date().toISOString() : null,
    created_by: createdBy,
    source_file_path: null,
    // QF-20260602-607: inherit venture_id from the linked vision when not explicitly
    // passed, so arch plans aren't orphaned (mirrors the vision-side fix QF-20260527-948).
    // Explicit ventureId still wins; a vision with no venture_id leaves it unset (no regression).
    ...((ventureId || visionDoc.venture_id) ? { venture_id: ventureId || visionDoc.venture_id } : {}),
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
    ...(sections ? { sections } : {}),
  };

  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .upsert(record, { onConflict: 'plan_key' })
    .select('id, plan_key, version, status, vision_id, quality_checked, quality_issues, chairman_approved, chairman_approved_at')
    .single();

  return { data, error };
}
