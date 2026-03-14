/**
 * SRIP Quality Checker Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-D
 *
 * 6-domain fidelity scoring comparing built output against reference site DNA.
 * Domains: layout, visual_composition, design_system, interaction, technical, accessibility
 *
 * Input: synthesis_prompt_id (loads reference DNA + prompt context)
 * Output: domain_scores, overall_score, gaps[], passed flag → stored in srip_quality_checks
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getValidationClient } from '../../../lib/llm/client-factory.js';

dotenv.config();

const QUALITY_DOMAINS = [
  { key: 'layout', label: 'Layout & Structure', weight: 0.20 },
  { key: 'visual_composition', label: 'Visual Composition', weight: 0.20 },
  { key: 'design_system', label: 'Design System Consistency', weight: 0.15 },
  { key: 'interaction', label: 'Interaction Patterns', weight: 0.15 },
  { key: 'technical', label: 'Technical Implementation', weight: 0.15 },
  { key: 'accessibility', label: 'Accessibility (WCAG)', weight: 0.15 },
];

const DEFAULT_PASS_THRESHOLD = 70;

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ============================================================================
// LLM Domain Evaluation Prompts
// ============================================================================

function buildDomainPrompt(domainKey) {
  const prompts = {
    layout: `You are a web layout forensics expert. Compare the reference site DNA with the built output.
Evaluate structural alignment: grid systems, section ordering, content flow, responsive breakpoints.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "strengths": ["..."],
  "gaps": [{"issue": "...", "severity": "critical|high|medium", "fix": "..."}]
}`,

    visual_composition: `You are a visual design analyst. Compare the reference and built output.
Evaluate: color palette adherence, typography hierarchy, whitespace rhythm, visual weight distribution.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "strengths": ["..."],
  "gaps": [{"issue": "...", "severity": "critical|high|medium", "fix": "..."}]
}`,

    design_system: `You are a design system auditor. Compare reference tokens/components with built output.
Evaluate: color token consistency, spacing scale adherence, component library match, typography scale.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "strengths": ["..."],
  "gaps": [{"issue": "...", "severity": "critical|high|medium", "fix": "..."}]
}`,

    interaction: `You are a UX interaction analyst. Compare interactive patterns between reference and built output.
Evaluate: hover states, transitions, navigation patterns, form behaviors, micro-interactions.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "strengths": ["..."],
  "gaps": [{"issue": "...", "severity": "critical|high|medium", "fix": "..."}]
}`,

    technical: `You are a frontend technical auditor. Evaluate the built output's technical quality.
Evaluate: semantic HTML, performance patterns, SEO structure, code organization, framework best practices.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "strengths": ["..."],
  "gaps": [{"issue": "...", "severity": "critical|high|medium", "fix": "..."}]
}`,

    accessibility: `You are a WCAG accessibility auditor. Evaluate the built output against WCAG 2.1 AA.
Evaluate: alt text, ARIA labels, keyboard navigation, color contrast, focus management, heading hierarchy.

Return ONLY valid JSON:
{
  "score": <0-100>,
  "strengths": ["..."],
  "gaps": [{"issue": "...", "severity": "critical|high|medium", "fix": "..."}]
}`,
  };

  return prompts[domainKey] || prompts.technical;
}

// ============================================================================
// LLM Evaluation
// ============================================================================

async function evaluateDomain(domain, referenceContext, builtOutput) {
  const client = await getValidationClient();
  const systemPrompt = buildDomainPrompt(domain.key);
  const userPrompt = `## Reference Site DNA (extracted patterns)
${JSON.stringify(referenceContext, null, 2).substring(0, 3000)}

## Built Output to Evaluate
${builtOutput.substring(0, 4000)}

Score the built output against the reference on a 0-100 scale for ${domain.label}.`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = response.content?.[0]?.text || '';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);
    return {
      score: Math.min(100, Math.max(0, Number(result.score) || 0)),
      strengths: result.strengths || [],
      gaps: (result.gaps || []).map(g => ({
        issue: g.issue || 'Unknown issue',
        severity: g.severity || 'medium',
        fix: g.fix || 'Review manually',
        domain: domain.key,
      })),
    };
  } catch (err) {
    console.warn(`  ⚠️  ${domain.label} evaluation failed: ${err.message}`);
    return { score: null, strengths: [], gaps: [{ issue: `Evaluation failed: ${err.message}`, severity: 'medium', fix: 'Re-run quality check', domain: domain.key }] };
  }
}

// ============================================================================
// Main Quality Check
// ============================================================================

export async function runQualityCheck({ synthesisPromptId, ventureId, builtOutputUrl, passThreshold }) {
  const supabase = getSupabase();
  const threshold = passThreshold || DEFAULT_PASS_THRESHOLD;

  console.log('\n✅ SRIP Quality Check');
  console.log('═'.repeat(50));

  // 1. Load synthesis prompt and linked site DNA
  let referenceContext = {};
  let resolvedVentureId = ventureId;

  if (synthesisPromptId) {
    const { data: prompt } = await supabase
      .from('srip_synthesis_prompts')
      .select('id, venture_id, site_dna_id, prompt_text')
      .eq('id', synthesisPromptId)
      .single();

    if (prompt) {
      resolvedVentureId = resolvedVentureId || prompt.venture_id;
      if (prompt.site_dna_id) {
        const { data: dna } = await supabase
          .from('srip_site_dna')
          .select('dna_json')
          .eq('id', prompt.site_dna_id)
          .single();
        if (dna?.dna_json) referenceContext = dna.dna_json;
      }
    }
  }

  // If no reference from prompt, try to get latest DNA for venture
  if (Object.keys(referenceContext).length === 0 && resolvedVentureId) {
    const { data: latestDna } = await supabase
      .from('srip_site_dna')
      .select('dna_json')
      .eq('venture_id', resolvedVentureId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (latestDna?.dna_json) referenceContext = latestDna.dna_json;
  }

  console.log(`  Reference context: ${Object.keys(referenceContext).length > 0 ? 'loaded' : 'empty (scoring without reference)'}`);
  console.log(`  Venture: ${resolvedVentureId || 'none'}`);
  console.log(`  Pass threshold: ${threshold}%`);

  // 2. Get built output content
  let builtOutput = '';
  if (builtOutputUrl) {
    try {
      const response = await fetch(builtOutputUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 SRIP-QualityChecker/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      builtOutput = (await response.text()).substring(0, 8000);
    } catch (err) {
      console.warn(`  ⚠️  Could not fetch built output: ${err.message}`);
      builtOutput = `[Built output URL: ${builtOutputUrl} - fetch failed]`;
    }
  } else {
    builtOutput = '[No built output URL provided - scoring based on synthesis prompt context only]';
  }

  // 3. Evaluate each domain
  console.log('\n  Evaluating 6 quality domains...');
  const domainScores = {};
  const allGaps = [];

  for (const domain of QUALITY_DOMAINS) {
    process.stdout.write(`    ${domain.label}... `);
    const result = await evaluateDomain(domain, referenceContext, builtOutput);
    domainScores[domain.key] = result.score;
    allGaps.push(...result.gaps);
    const scoreDisplay = result.score !== null ? `${result.score}/100` : 'SKIP';
    console.log(scoreDisplay);
  }

  // 4. Calculate overall score (weighted average, skip nulls)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const domain of QUALITY_DOMAINS) {
    if (domainScores[domain.key] !== null) {
      weightedSum += domainScores[domain.key] * domain.weight;
      totalWeight += domain.weight;
    }
  }
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const passed = overallScore >= threshold;

  // 5. Display results
  console.log('\n  Results:');
  console.log('  ' + '─'.repeat(40));
  for (const domain of QUALITY_DOMAINS) {
    const score = domainScores[domain.key];
    const bar = score !== null ? '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5)) : '? '.repeat(10);
    console.log(`    ${domain.label.padEnd(28)} ${bar} ${score !== null ? score + '%' : 'N/A'}`);
  }
  console.log('  ' + '─'.repeat(40));
  console.log(`    Overall Score: ${overallScore}% (threshold: ${threshold}%)`);
  console.log(`    Verdict: ${passed ? '✅ PASS' : '❌ FAIL'}`);

  if (allGaps.length > 0) {
    console.log(`\n  Gaps (${allGaps.length}):`);
    const critical = allGaps.filter(g => g.severity === 'critical');
    const high = allGaps.filter(g => g.severity === 'high');
    if (critical.length > 0) {
      console.log(`    🔴 Critical (${critical.length}):`);
      critical.slice(0, 3).forEach(g => console.log(`       - ${g.issue}`));
    }
    if (high.length > 0) {
      console.log(`    🟠 High (${high.length}):`);
      high.slice(0, 3).forEach(g => console.log(`       - ${g.issue}`));
    }
  }

  // 6. Persist to database
  const { data: checkRecord, error: insertError } = await supabase
    .from('srip_quality_checks')
    .insert({
      venture_id: resolvedVentureId || null,
      synthesis_prompt_id: synthesisPromptId || null,
      domain_scores: domainScores,
      overall_score: overallScore,
      gaps: allGaps,
      pass_threshold: threshold,
    })
    .select('id, overall_score, passed')
    .single();

  if (insertError) {
    console.error(`\n  ❌ Failed to persist quality check: ${insertError.message}`);
    return { overallScore, passed, gaps: allGaps, domainScores, error: insertError.message };
  }

  console.log(`\n  💾 Stored: ${checkRecord.id}`);

  // 7. Link to venture artifacts if venture exists
  if (resolvedVentureId) {
    const { error: artifactError } = await supabase
      .from('venture_artifacts')
      .insert({
        venture_id: resolvedVentureId,
        artifact_type: 'srip_quality_check',
        artifact_id: checkRecord.id,
        metadata: { overall_score: overallScore, passed, gap_count: allGaps.length },
      });

    if (artifactError) {
      console.warn(`  ⚠️  Venture artifact link failed: ${artifactError.message}`);
    } else {
      console.log(`  🔗 Linked to venture artifacts`);
    }
  }

  console.log('═'.repeat(50));
  return { id: checkRecord.id, overallScore, passed, gaps: allGaps, domainScores };
}
