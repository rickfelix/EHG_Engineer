// lib/eva/archplan-upsert.js
/**
 * Reusable Architecture Plan upsert for EVA.
 * Extracted from scripts/eva/archplan-command.mjs to enable programmatic use
 * without CLI side effects.
 *
 * @module lib/eva/archplan-upsert
 */

export async function upsertArchPlan({ supabase, planKey, visionKey, content, sections: providedSections, dimensions, ventureId, brainstormId, createdBy = 'eva-archplan-upsert' }) {
  if (!supabase) throw new Error('supabase client is required');
  if (!planKey) throw new Error('planKey is required');
  if (!visionKey) throw new Error('visionKey is required');
  if (!content) throw new Error('content is required');

  // Resolve vision_id and version from vision_key
  const { data: visionDoc, error: visionErr } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, level, status, version')
    .eq('vision_key', visionKey)
    .single();

  if (visionErr || !visionDoc) {
    return { data: null, error: visionErr || new Error(`Vision document not found: ${visionKey}`) };
  }

  // Determine version
  const { data: existing } = await supabase
    .from('eva_architecture_plans')
    .select('id, version')
    .eq('plan_key', planKey)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;

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

  const record = {
    plan_key: planKey,
    vision_id: visionDoc.id,
    vision_key: visionDoc.vision_key,
    vision_version_aligned_to: visionDoc.version || 1,
    content,
    extracted_dimensions: dimensions || null,
    version,
    status: 'active',
    chairman_approved: true,
    created_by: createdBy,
    source_file_path: null,
    ...(ventureId ? { venture_id: ventureId } : {}),
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
    ...(sections ? { sections } : {}),
  };

  const { data, error } = await supabase
    .from('eva_architecture_plans')
    .upsert(record, { onConflict: 'plan_key' })
    .select('id, plan_key, version, status, vision_id, quality_checked, quality_issues')
    .single();

  return { data, error };
}
