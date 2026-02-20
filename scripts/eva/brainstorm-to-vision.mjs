#!/usr/bin/env node
/**
 * Brainstorm-to-Vision Pipeline
 * SD: SD-EHG-ORCH-GOVERNANCE-STACK-001-E
 *
 * Wires brainstorm sessions with vision-relevant outcomes to EVA vision documents.
 * Sessions with 'significant_departure' create addendums on L1 vision.
 * Sessions with 'sd_created' (strategic scope) create new L2 vision docs.
 *
 * Usage:
 *   node scripts/eva/brainstorm-to-vision.mjs              # Process all unlinked sessions
 *   node scripts/eva/brainstorm-to-vision.mjs --dry-run    # Preview without DB changes
 *   node scripts/eva/brainstorm-to-vision.mjs --id <uuid>  # Process single session
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getValidationClient } from '../../lib/llm/client-factory.js';

dotenv.config();

const VISION_RELEVANT_OUTCOMES = ['sd_created', 'significant_departure'];
const L1_VISION_KEY = 'VISION-EHG-L1-001';
const MAX_LLM_CONTENT_CHARS = 8000;

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { dryRun: false, id: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    if (args[i] === '--id' && args[i + 1]) opts.id = args[++i];
  }
  return opts;
}

async function extractDimensions(content) {
  const truncated = content.length > MAX_LLM_CONTENT_CHARS
    ? content.slice(0, MAX_LLM_CONTENT_CHARS) + '\n...[truncated]'
    : content;

  const prompt = `You are analyzing a brainstorm session output. Extract 3-6 key scoring dimensions that represent the major strategic insights or departures identified. These dimensions measure alignment with strategic vision.

For each dimension, provide:
- name: short identifier (e.g., "governance_redesign", "event_consolidation")
- weight: relative importance 0.0-1.0 (weights should sum to ~1.0)
- description: one sentence explaining what this dimension measures
- source_section: which brainstorm topic or insight this comes from

Return ONLY a valid JSON array. No explanation text.

Brainstorm Content:
${truncated}`;

  try {
    const client = getValidationClient();
    const response = await client.complete(
      'Extract structured scoring dimensions from brainstorm outputs. Return only valid JSON arrays.',
      prompt
    );
    const text = typeof response === 'string' ? response : response?.content || response?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const dims = JSON.parse(match[0]);
    return Array.isArray(dims) && dims.length > 0 ? dims : null;
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(' BRAINSTORM → VISION PIPELINE');
  if (opts.dryRun) console.log(' MODE: DRY RUN (no DB changes)');
  console.log('═══════════════════════════════════════════════════════\n');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Find unlinked brainstorm sessions with vision-relevant outcomes
  let query = supabase
    .from('brainstorm_sessions')
    .select('id, topic, outcome_type, metadata, document_path, new_capability_candidates, created_at')
    .in('outcome_type', VISION_RELEVANT_OUTCOMES)
    .order('created_at', { ascending: true });

  if (opts.id) {
    query = query.eq('id', opts.id);
  }

  const { data: sessions, error: sessErr } = await query;
  if (sessErr) { console.error('❌ Query failed:', sessErr.message); process.exit(1); }
  if (!sessions?.length) { console.log('✅ No unlinked brainstorm sessions found.'); return; }

  // Find which sessions already have linked vision docs
  const { data: linked } = await supabase
    .from('eva_vision_documents')
    .select('source_brainstorm_id')
    .in('source_brainstorm_id', sessions.map(s => s.id));

  const linkedIds = new Set((linked || []).map(d => d.source_brainstorm_id));
  const unlinked = sessions.filter(s => !linkedIds.has(s.id));

  console.log(`📊 Found ${sessions.length} vision-relevant session(s), ${unlinked.length} unlinked\n`);

  if (!unlinked.length) { console.log('✅ All sessions already linked to vision docs.'); return; }

  // Get L1 vision doc for addendums
  const { data: l1Vision } = await supabase
    .from('eva_vision_documents')
    .select('id, vision_key, content, addendums, version')
    .eq('vision_key', L1_VISION_KEY)
    .maybeSingle();

  let processed = 0;

  for (const session of unlinked) {
    const label = session.topic?.slice(0, 60) || session.id;
    console.log(`\n─── Processing: ${label}`);
    console.log(`    Outcome: ${session.outcome_type} | Created: ${session.created_at}`);

    // Build content from session data: prefer document_path, fallback to metadata+topic
    let content = '';
    if (session.document_path) {
      try {
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');
        const docPath = resolve(process.cwd(), session.document_path);
        content = readFileSync(docPath, 'utf8');
        console.log(`    📄 Loaded document: ${session.document_path} (${content.length} chars)`);
      } catch {
        console.log(`    ⚠️  Document not found: ${session.document_path}, using metadata`);
      }
    }
    if (!content || content.length < 50) {
      content = [
        session.topic ? `# ${session.topic}` : '',
        session.metadata?.summary || session.metadata?.description || '',
        Array.isArray(session.new_capability_candidates)
          ? session.new_capability_candidates.map(c => `- ${typeof c === 'string' ? c : c.name || JSON.stringify(c)}`).join('\n')
          : '',
      ].filter(Boolean).join('\n\n');
    }

    if (content.length < 50) {
      console.log('    ⚠️  Insufficient content (< 50 chars), skipping');
      continue;
    }

    if (session.outcome_type === 'significant_departure' && l1Vision) {
      // Add as addendum to L1 vision
      console.log(`    → Adding addendum to ${L1_VISION_KEY}`);

      if (opts.dryRun) {
        console.log('    [DRY RUN] Would add addendum and set source_brainstorm_id');
        processed++;
        continue;
      }

      const addendum = {
        section: content,
        added_at: new Date().toISOString(),
        added_by: 'brainstorm-to-vision-pipeline',
        source_brainstorm_id: session.id,
      };

      const currentAddendums = l1Vision.addendums || [];
      const updatedAddendums = [...currentAddendums, addendum];
      const combinedContent = `${l1Vision.content}\n\n---\n\n## Addendum ${updatedAddendums.length} (from brainstorm)\n\n${content}`;

      console.log('    🤖 Re-extracting dimensions...');
      const dimensions = await extractDimensions(combinedContent);

      const { error: updErr } = await supabase
        .from('eva_vision_documents')
        .update({
          addendums: updatedAddendums,
          content: combinedContent,
          extracted_dimensions: dimensions,
          source_brainstorm_id: session.id,
          updated_at: new Date().toISOString(),
        })
        .eq('vision_key', L1_VISION_KEY);

      if (updErr) { console.error(`    ❌ Addendum failed: ${updErr.message}`); continue; }
      console.log(`    ✅ Addendum added (${dimensions?.length || 0} dimensions re-extracted)`);

    } else if (session.outcome_type === 'sd_created') {
      // Create new L2 vision doc
      const visionKey = `VISION-BS-${session.id.slice(0, 8).toUpperCase()}`;
      console.log(`    → Creating L2 vision doc: ${visionKey}`);

      if (opts.dryRun) {
        console.log('    [DRY RUN] Would create L2 vision doc');
        processed++;
        continue;
      }

      console.log('    🤖 Extracting dimensions...');
      const dimensions = await extractDimensions(content);

      const { error: insErr } = await supabase
        .from('eva_vision_documents')
        .upsert({
          vision_key: visionKey,
          level: 'L2',
          content,
          extracted_dimensions: dimensions,
          version: 1,
          status: 'draft',
          chairman_approved: false,
          source_brainstorm_id: session.id,
          created_by: 'brainstorm-to-vision-pipeline',
        }, { onConflict: 'vision_key' });

      if (insErr) { console.error(`    ❌ Insert failed: ${insErr.message}`); continue; }
      console.log(`    ✅ L2 vision doc created (${dimensions?.length || 0} dimensions)`);
    }

    processed++;
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(` PIPELINE COMPLETE: ${processed}/${unlinked.length} session(s) processed`);
  console.log('═══════════════════════════════════════════════════════\n');
}

// Windows-compatible ESM entry point
if (
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`
) {
  main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
}

export { main };
