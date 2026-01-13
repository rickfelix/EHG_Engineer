#!/usr/bin/env node

/**
 * Align SDs to Key Results
 *
 * Uses AI to analyze each pending SD and determine which Key Results it advances.
 * Creates alignments in sd_key_result_alignment table.
 *
 * Run: node scripts/align-sds-to-krs.js
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EHG_ENGINEER_ROOT = path.resolve(__dirname, '..');

// Load environment
const envPath = path.join(EHG_ENGINEER_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// Key Results reference for AI - Q1 2026
const KR_DEFINITIONS = `
KEY RESULTS (align SDs to these):

O1-TRUTH-ENGINE: Ship "The Truth Engine" (Tier 2) MVP
- KR1.1-TECH-ARCH: Finalize Technical Architecture by Jan 31
  → SDs related to architecture design, technical decisions, system design
- KR1.2-SOFT-LAUNCH: Execute Soft Launch/QA Audit by Feb 14 (0% human intervention)
  → SDs related to testing, QA, automation, deployment preparation
- KR1.3-PUBLIC-LAUNCH: Public Commercial Launch ($129) by March 1
  → SDs related to production deployment, marketing, user onboarding
- KR1.4-COMMERCE-STACK: Complete Commerce Stack integration (Stripe, Chargeblast)
  → SDs related to payments, billing, subscriptions, commerce

O2-COMMERCIAL: Validate Commercial Viability
- KR2.1-PAID-USERS: Acquire 15 paid users by March 31
  → SDs related to user acquisition, conversion, sales funnel
- KR2.2-ZERO-TOUCH: >90% zero-touch support ratio
  → SDs related to self-service, automation, documentation, help systems
- KR2.3-TESTIMONIALS: Secure 5 verified testimonials
  → SDs related to customer success, feedback collection, social proof

O3-CAPACITY: Maintain Founder Operational Capacity
- KR3.1-HARD-STOP: Hard stop at 11:00 PM
  → SDs related to workflow efficiency, automation, time-saving
- KR3.2-SUNDAY-AUDIT: Weekly Sunday Strategy Audit
  → SDs related to strategic planning, reporting, dashboards
- KR3.3-UPTIME: 100% operational uptime (zero burnout days)
  → SDs related to operational efficiency, reducing manual work, automation
`;

async function loadKeyResults() {
  const { data: krs, error } = await supabase
    .from('key_results')
    .select('id, code, title, objective_id')
    .eq('is_active', true);

  if (error) throw error;

  // Create lookup map
  const krMap = {};
  for (const kr of krs) {
    krMap[kr.code] = kr;
  }
  return krMap;
}

async function loadPendingSDs() {
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, description, strategic_intent, rationale, category, sd_type')
    .eq('is_active', true)
    .not('status', 'in', '("completed","cancelled","deferred")')
    .order('sequence_rank', { nullsFirst: false });

  if (error) throw error;
  return sds || [];
}

async function getExistingAlignments(sdId) {
  const { data } = await supabase
    .from('sd_key_result_alignment')
    .select('key_result_id')
    .eq('sd_id', sdId);

  return data?.map(a => a.key_result_id) || [];
}

async function alignSDToKRs(sd, krMap) {
  const prompt = `You are a strategic alignment analyst. Your job is to determine which Key Results an SD (Strategic Directive) advances.

IMPORTANT CONTEXT:
- "The Truth Engine" is a product that will be launched through a 25-stage venture workflow
- Infrastructure SDs that build parts of the venture workflow (naming engine, financial engine, venture evaluation, etc.) are ENABLING work for shipping The Truth Engine
- An SD can have "enabling" alignment even if it doesn't directly touch the product code
- Think about the chain: Infrastructure → Platform → Product → Launch → Users

${KR_DEFINITIONS}

STRATEGIC DIRECTIVE TO ANALYZE:
- ID: ${sd.legacy_id}
- Title: ${sd.title}
- Description: ${sd.description || 'N/A'}
- Strategic Intent: ${sd.strategic_intent || 'N/A'}
- Rationale: ${sd.rationale || 'N/A'}
- Category: ${sd.category || 'N/A'}
- Type: ${sd.sd_type || 'N/A'}

ALIGNMENT RULES:
1. Every SD should align to at least one KR if it's part of the work stream
2. Infrastructure/platform SDs that enable product launch → align to O1-TRUTH-ENGINE KRs as "enabling"
3. Automation/efficiency SDs → align to O3-CAPACITY KRs (saves founder time)
4. Direct product features → align to O1-TRUTH-ENGINE KRs as "direct"
5. Customer-facing features → align to O2-COMMERCIAL KRs

For each alignment, specify:
- kr_code: The KR code (e.g., "KR1.1-TECH-ARCH")
- contribution_type: "direct" (moves the KR metric directly), "enabling" (infrastructure/platform that unblocks the KR), or "supporting" (helps indirectly)
- contribution_note: Brief explanation (max 50 chars)

Respond with ONLY a JSON array. Example:
[
  {"kr_code": "KR1.1-TECH-ARCH", "contribution_type": "enabling", "contribution_note": "Platform component for venture workflow"},
  {"kr_code": "KR3.3-UPTIME", "contribution_type": "supporting", "contribution_note": "Automates manual process"}
]

JSON response:`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-5.2',
      max_completion_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    let content = response.choices[0].message.content.trim();

    // Strip markdown code blocks if present
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Parse JSON response
    const alignments = JSON.parse(content);

    // Validate and enrich with KR IDs
    const validAlignments = [];
    for (const a of alignments) {
      const kr = krMap[a.kr_code];
      if (kr) {
        validAlignments.push({
          sd_id: sd.id,
          key_result_id: kr.id,
          contribution_type: a.contribution_type || 'supporting',
          contribution_note: a.contribution_note?.substring(0, 100) || null,
          aligned_by: 'ai_auto',
          alignment_confidence: 0.8,
          created_by: 'align-sds-to-krs.js',
        });
      }
    }

    return validAlignments;
  } catch (err) {
    console.log(`${colors.red}    Error: ${err.message}${colors.reset}`);
    return [];
  }
}

async function saveAlignments(alignments) {
  if (alignments.length === 0) return 0;

  const { error } = await supabase
    .from('sd_key_result_alignment')
    .upsert(alignments, {
      onConflict: 'sd_id,key_result_id',
      ignoreDuplicates: false
    });

  if (error) {
    console.log(`${colors.red}    Save error: ${error.message}${colors.reset}`);
    return 0;
  }

  return alignments.length;
}

async function run() {
  console.log(`\n${colors.cyan}${colors.bold}═══════════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold} SD-TO-KR ALIGNMENT - AI-Powered Strategic Mapping${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Load Key Results
  console.log(`${colors.yellow}[1/4] Loading Key Results...${colors.reset}`);
  const krMap = await loadKeyResults();
  console.log(`${colors.green}  ✓ Loaded ${Object.keys(krMap).length} Key Results${colors.reset}`);

  // Load pending SDs
  console.log(`\n${colors.yellow}[2/4] Loading pending SDs...${colors.reset}`);
  const sds = await loadPendingSDs();
  console.log(`${colors.green}  ✓ Found ${sds.length} pending SDs${colors.reset}`);

  // Filter out already-aligned SDs (optional - to re-align, remove this)
  const sdsToAlign = [];
  for (const sd of sds) {
    const existing = await getExistingAlignments(sd.id);
    if (existing.length === 0) {
      sdsToAlign.push(sd);
    }
  }
  console.log(`${colors.dim}  (${sds.length - sdsToAlign.length} already aligned, ${sdsToAlign.length} to process)${colors.reset}`);

  // Align each SD
  console.log(`\n${colors.yellow}[3/4] Aligning SDs to Key Results...${colors.reset}`);

  let totalAligned = 0;
  let totalAlignments = 0;
  const batchSize = 10;

  for (let i = 0; i < sdsToAlign.length; i++) {
    const sd = sdsToAlign[i];
    const progress = `[${i + 1}/${sdsToAlign.length}]`;

    process.stdout.write(`  ${progress} ${sd.legacy_id.padEnd(30)} `);

    const alignments = await alignSDToKRs(sd, krMap);

    if (alignments.length > 0) {
      const saved = await saveAlignments(alignments);
      totalAlignments += saved;
      totalAligned++;

      const krCodes = alignments.map(a => {
        const kr = Object.values(krMap).find(k => k.id === a.key_result_id);
        return kr?.code?.split('-')[0] + '.' + kr?.code?.split('-')[1]?.charAt(0);
      }).join(', ');

      console.log(`${colors.green}→ ${alignments.length} KRs (${krCodes})${colors.reset}`);
    } else {
      console.log(`${colors.dim}→ no alignment${colors.reset}`);
    }

    // Rate limiting - pause every batch
    if ((i + 1) % batchSize === 0 && i < sdsToAlign.length - 1) {
      process.stdout.write(`${colors.dim}  (pausing for rate limit...)${colors.reset}\r`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Summary
  console.log(`\n${colors.yellow}[4/4] Summary...${colors.reset}`);

  const { data: stats } = await supabase
    .from('v_okr_scorecard')
    .select('*')
    .order('sequence');

  console.log(`\n${colors.cyan}${colors.bold}ALIGNMENT RESULTS:${colors.reset}`);
  console.log(`  SDs processed: ${sdsToAlign.length}`);
  console.log(`  SDs aligned: ${totalAligned}`);
  console.log(`  Total alignments created: ${totalAlignments}`);

  if (stats) {
    console.log(`\n${colors.cyan}${colors.bold}OKR COVERAGE:${colors.reset}`);
    for (const obj of stats) {
      // Get SD count for this objective
      const { count } = await supabase
        .from('sd_key_result_alignment')
        .select('*', { count: 'exact', head: true })
        .in('key_result_id',
          await supabase
            .from('key_results')
            .select('id')
            .eq('objective_id', obj.objective_id)
            .then(r => r.data?.map(k => k.id) || [])
        );

      console.log(`  ${obj.objective_code}: ${count || 0} SDs aligned`);
    }
  }

  // Show unaligned count
  const { data: unaligned } = await supabase.rpc('get_unaligned_sds');
  console.log(`\n${colors.yellow}Remaining unaligned SDs: ${unaligned?.length || 0}${colors.reset}`);

  console.log(`\n${colors.green}${colors.bold}✓ Alignment complete!${colors.reset}\n`);
}

run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
