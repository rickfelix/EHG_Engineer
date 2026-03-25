// lib/eva/vision-upsert.js
/**
 * Reusable Vision document upsert for EVA.
 * Extracted from scripts/eva/vision-command.mjs to enable programmatic use
 * without CLI side effects (process.exit, console.error).
 *
 * @module lib/eva/vision-upsert
 */

export async function upsertVision({ supabase, visionKey, level = 'L2', content, sections, dimensions, ventureId, brainstormId, createdBy = 'eva-vision-upsert' }) {
  if (!supabase) throw new Error('supabase client is required');
  if (!visionKey) throw new Error('visionKey is required');
  if (!content) throw new Error('content is required');

  // Fetch existing version + addendums
  const { data: existing } = await supabase
    .from('eva_vision_documents')
    .select('id, version, addendums')
    .eq('vision_key', visionKey)
    .maybeSingle();

  const version = existing ? existing.version + 1 : 1;

  // Build addendums array — append entry on each enrichment (append-only)
  const prevAddendums = existing?.addendums || [];
  const addendums = version > 1
    ? [...prevAddendums, {
        version,
        timestamp: new Date().toISOString(),
        created_by: createdBy,
        changed_sections: sections ? Object.keys(sections).filter(k => k !== 'extracted_at' && k !== 'extraction_source') : [],
      }]
    : prevAddendums;

  const record = {
    vision_key: visionKey,
    level,
    content,
    extracted_dimensions: dimensions || null,
    version,
    status: 'active',
    chairman_approved: true,
    source_file_path: null,
    created_by: createdBy,
    addendums,
    ...(sections && Object.keys(sections).length > 0 ? { sections } : {}),
    ...(ventureId ? { venture_id: ventureId } : {}),
    ...(brainstormId ? { source_brainstorm_id: brainstormId } : {}),
  };

  const { data, error } = await supabase
    .from('eva_vision_documents')
    .upsert(record, { onConflict: 'vision_key' })
    .select('id, vision_key, level, version, status, quality_checked, quality_issues')
    .single();

  return { data, error };
}
