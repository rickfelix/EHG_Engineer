#!/usr/bin/env node

/**
 * lead-dossier.js — SD Dossier Automation
 *
 * Assembles LEAD evaluation data for an SD by querying:
 * - strategic_directives_v2 (SD metadata)
 * - product_requirements_v2 (PRD)
 * - sd_backlog_map (backlog items)
 * - lead_evaluations (existing evaluations)
 * - SD dependency graph (parent/child relationships)
 *
 * Then derives and persists a structured evaluation in lead_evaluations.
 *
 * Usage: npm run lead:dossier -- <SD-KEY>
 *   Options:
 *     --dry-run    Print dossier JSON without writing to lead_evaluations
 *     --json       Output raw JSON (default: formatted summary)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchSD(sdKey) {
  // Try by sd_key first, then by id (for legacy SDs)
  let { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (!data) {
    ({ data, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdKey)
      .maybeSingle());
  }

  if (error) throw new Error(`SD query error: ${error.message}`);
  return data;
}

async function fetchPRD(sdKey, sdId) {
  // PRD.directive_id stores sd_key, but some may use UUID id
  let { data } = await supabase
    .from('product_requirements_v2')
    .select('id, directive_id, title, status, executive_summary, functional_requirements, acceptance_criteria, technical_requirements')
    .eq('directive_id', sdKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data && sdId !== sdKey) {
    ({ data } = await supabase
      .from('product_requirements_v2')
      .select('id, directive_id, title, status, executive_summary, functional_requirements, acceptance_criteria, technical_requirements')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle());
  }

  return data;
}

async function fetchBacklog(sdKey) {
  const { data } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', sdKey);
  return data || [];
}

async function fetchExistingEvaluations(sdKey) {
  const { data } = await supabase
    .from('lead_evaluations')
    .select('*')
    .eq('sd_id', sdKey)
    .order('evaluated_at', { ascending: false });
  return data || [];
}

async function fetchDependencyGraph(sd) {
  const graph = { parent: null, children: [], siblings: [] };

  // Parent
  if (sd.parent_sd_id) {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, sd_type')
      .eq('id', sd.parent_sd_id)
      .maybeSingle();
    graph.parent = parent;

    // Siblings (other children of same parent)
    if (parent) {
      const { data: siblings } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, status, sd_type')
        .eq('parent_sd_id', sd.parent_sd_id)
        .neq('id', sd.id);
      graph.siblings = siblings || [];
    }
  }

  // Children
  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, sd_type')
    .eq('parent_sd_id', sd.id);
  graph.children = children || [];

  return graph;
}

async function fetchSimilarSDs(sd) {
  // Multi-field similarity: search title, description, and strategic_objectives
  const searchFields = [
    sd.title || '',
    sd.description || '',
    Array.isArray(sd.strategic_objectives) ? sd.strategic_objectives.join(' ') : (sd.strategic_objectives || ''),
  ].join(' ');

  const words = searchFields
    .split(/\s+/)
    .filter(w => w.length > 4 && !['should', 'would', 'could', 'which', 'their', 'about', 'these', 'those'].includes(w.toLowerCase()))
    .slice(0, 6);

  if (words.length === 0) return [];

  const hitMap = new Map(); // id -> { sd, hitCount }
  for (const word of words) {
    // Search title
    const { data: titleHits } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, sd_type, description')
      .ilike('title', `%${word}%`)
      .neq('id', sd.id)
      .limit(10);

    // Search description
    const { data: descHits } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, sd_type, description')
      .ilike('description', `%${word}%`)
      .neq('id', sd.id)
      .limit(10);

    for (const hit of [...(titleHits || []), ...(descHits || [])]) {
      if (hitMap.has(hit.id)) {
        hitMap.get(hit.id).hitCount++;
      } else {
        hitMap.set(hit.id, { ...hit, hitCount: 1 });
      }
    }
  }

  // Score and sort by hit count (more field matches = higher relevance)
  return Array.from(hitMap.values())
    .map(h => ({ ...h, relevanceScore: Math.round((h.hitCount / words.length) * 100) }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 15);
}

async function fetchRelatedRetros(similarSDs) {
  if (!similarSDs || similarSDs.length === 0) return [];

  // Get retrospectives from completed similar SDs
  const completedSDs = similarSDs
    .filter(s => s.status === 'completed')
    .slice(0, 5);

  if (completedSDs.length === 0) return [];

  const sdIds = completedSDs.map(s => s.id);
  const { data } = await supabase
    .from('retrospectives')
    .select('id, sd_id, key_learnings, what_went_well, what_needs_improvement, quality_score')
    .in('sd_id', sdIds)
    .order('created_at', { ascending: false });

  return (data || []).map(r => ({
    sd_id: r.sd_id,
    sd_key: completedSDs.find(s => s.id === r.sd_id)?.sd_key,
    key_learnings: r.key_learnings,
    what_went_well: r.what_went_well,
    quality_score: r.quality_score,
  }));
}

async function fetchEvidenceMapping() {
  const { data } = await supabase
    .from('evidence_gate_mapping')
    .select('gate_question_id, gate_question_text, evidence_steps, evidence_description')
    .order('gate_question_id');
  return data || [];
}

function computeEvidenceCoverage(sd, prd, backlog, graph, similarSDs, existingEvals, mapping) {
  // Evidence step availability: 1=SD Metadata, 2=PRD, 3=Backlog/Stories, 4=Dependencies, 5=Similar SDs, 6=Evaluations
  const available = new Set();
  if (sd && sd.title && sd.description) available.add(1);
  if (prd) available.add(2);
  if (backlog && backlog.length > 0) available.add(3);
  if (graph && (graph.parent || graph.children.length > 0 || graph.siblings > 0)) available.add(4);
  if (similarSDs && similarSDs.length > 0) available.add(5);
  if (existingEvals && existingEvals.length > 0) available.add(6);

  const results = mapping.map(m => {
    const steps = m.evidence_steps || [];
    const covered = steps.filter(s => available.has(s));
    return {
      gate_question_id: m.gate_question_id,
      gate_question_text: m.gate_question_text,
      evidence_description: m.evidence_description,
      total_steps: steps.length,
      covered_steps: covered.length,
      coverage_pct: steps.length > 0 ? Math.round((covered.length / steps.length) * 100) : 0,
      missing_steps: steps.filter(s => !available.has(s)),
    };
  });

  const totalPossible = results.reduce((a, r) => a + r.total_steps, 0);
  const totalCovered = results.reduce((a, r) => a + r.covered_steps, 0);
  const overallScore = totalPossible > 0 ? Math.round((totalCovered / totalPossible) * 100) : 0;

  return { results, overallScore };
}

function deriveEvaluation(sd, prd, backlog, graph, similarSDs, evidenceCoverageScore) {
  // Business value: based on SD type and category
  const typeWeights = { feature: 'HIGH', bugfix: 'MEDIUM', infrastructure: 'MEDIUM', database: 'MEDIUM' };
  const businessValue = sd.priority === 'critical' ? 'HIGH'
    : sd.priority === 'high' ? 'HIGH'
    : typeWeights[sd.sd_type] || 'MEDIUM';

  // Duplication risk: based on similar SDs found
  const activeSimilar = similarSDs.filter(s => !['completed', 'cancelled'].includes(s.status));
  const duplicationRisk = activeSimilar.length >= 3 ? 'HIGH'
    : activeSimilar.length >= 1 ? 'MEDIUM'
    : 'LOW';

  // Resource cost: based on children count, complexity indicators
  const childCount = graph.children.length;
  const hasComplexType = ['orchestrator'].includes(sd.sd_type) || sd.category === 'Orchestrator';
  const resourceCost = childCount >= 5 || hasComplexType ? 'HIGH'
    : childCount >= 2 ? 'MEDIUM'
    : 'LOW';

  // Scope complexity: based on PRD presence, requirements count
  const reqCount = prd?.functional_requirements?.length || 0;
  const acCount = prd?.acceptance_criteria?.length || 0;
  const scopeComplexity = (reqCount + acCount) > 10 ? 'HIGH'
    : (reqCount + acCount) > 4 ? 'MEDIUM'
    : 'LOW';

  // Confidence score: based on data completeness
  let confidence = 20; // base
  if (prd) confidence += 25;
  if (backlog.length > 0) confidence += 15;
  if (graph.parent || graph.children.length > 0) confidence += 15;
  if (sd.strategic_objectives) confidence += 10;
  if (sd.description && sd.description.length > 50) confidence += 15;
  confidence = Math.min(confidence, 100);

  // Justification
  const justParts = [];
  justParts.push(`Business value: ${businessValue} (type=${sd.sd_type}, priority=${sd.priority || 'unset'})`);
  justParts.push(`Duplication risk: ${duplicationRisk} (${activeSimilar.length} active similar SDs found)`);
  justParts.push(`Resource cost: ${resourceCost} (${childCount} children, category=${sd.category || 'none'})`);
  justParts.push(`Scope complexity: ${scopeComplexity} (${reqCount} functional reqs, ${acCount} acceptance criteria)`);
  justParts.push(`Data completeness: PRD=${!!prd}, backlog=${backlog.length} items, dependencies=${graph.children.length + (graph.parent ? 1 : 0)}`);

  // Decision
  let decision = 'APPROVE';
  const requiredActions = [];
  if (duplicationRisk === 'HIGH') {
    decision = 'CLARIFY';
    requiredActions.push('Review similar active SDs for potential consolidation');
  }
  if (!prd) {
    requiredActions.push('Create PRD before proceeding to PLAN phase');
  }
  if (confidence < 40) {
    decision = 'CLARIFY';
    requiredActions.push('Insufficient data for confident evaluation — enrich SD metadata');
  }

  // Numeric scores (0-100) mapped from text levels
  const levelToScore = { HIGH: 85, MEDIUM: 50, LOW: 20 };
  const businessValueScore = levelToScore[businessValue] || 50;
  const duplicationRiskScore = levelToScore[duplicationRisk] || 50;
  const resourceCostScore = levelToScore[resourceCost] || 50;
  const scopeComplexityScore = levelToScore[scopeComplexity] || 50;

  // Technical debt impact: based on SD type and category signals
  const debtKeywords = ['refactor', 'debt', 'cleanup', 'legacy', 'deprecat'];
  const titleLower = (sd.title || '').toLowerCase();
  const descLower = (sd.description || '').toLowerCase();
  const hasDebtSignal = debtKeywords.some(k => titleLower.includes(k) || descLower.includes(k));
  const technicalDebtImpact = hasDebtSignal ? 'HIGH'
    : sd.sd_type === 'infrastructure' ? 'MEDIUM'
    : 'LOW';

  // Dependency risk: based on graph connectivity
  const totalDeps = graph.children.length + (graph.parent ? 1 : 0) + graph.siblings;
  const dependencyRisk = totalDeps >= 8 ? 'HIGH'
    : totalDeps >= 4 ? 'MEDIUM'
    : totalDeps >= 1 ? 'LOW'
    : 'NONE';

  // Baseline snapshot: capture SD state at evaluation time for drift detection
  const baseline_snapshot = {
    title: sd.title || null,
    description: sd.description || null,
    key_changes: sd.key_changes || null,
    success_criteria: sd.success_criteria || null,
    scope: sd.scope || null,
  };

  // Scope exclusions: items intentionally out of scope (empty by default, enriched by evaluator)
  const scope_exclusions = [];

  return {
    business_value: businessValue,
    duplication_risk: duplicationRisk,
    resource_cost: resourceCost,
    scope_complexity: scopeComplexity,
    business_value_score: businessValueScore,
    duplication_risk_score: duplicationRiskScore,
    resource_cost_score: resourceCostScore,
    scope_complexity_score: scopeComplexityScore,
    technical_debt_impact: technicalDebtImpact,
    dependency_risk: dependencyRisk,
    evidence_coverage_score: evidenceCoverageScore || 0,
    confidence_score: confidence,
    final_decision: decision,
    justification: justParts.join('\n'),
    required_actions: requiredActions.length > 0 ? requiredActions : null,
    baseline_snapshot,
    scope_exclusions,
  };
}

async function persistEvaluation(sdId, evaluation) {
  const row = {
    id: randomUUID(),
    sd_id: sdId,
    ...evaluation,
    evaluator: 'LEAD_DOSSIER_v1.0',
    evaluation_version: '1.0',
  };

  const { data, error } = await supabase
    .from('lead_evaluations')
    .insert(row)
    .select('id, sd_id, final_decision, confidence_score');

  if (error) {
    // If duplicate (same sd_id + evaluated_at), this is expected on re-run
    if (error.code === '23505') {
      console.error('⚠️  Evaluation already exists for this SD at this timestamp. Use a different timestamp or update existing.');
      return null;
    }
    throw new Error(`Failed to persist evaluation: ${error.message}`);
  }

  return data?.[0];
}

function formatSummary(dossier) {
  const { sd, prd, backlog, graph, similarSDs, relatedRetros, evidenceCoverage, evaluation } = dossier;
  const lines = [];

  lines.push('╔══════════════════════════════════════════════════════════════╗');
  lines.push(`║  SD DOSSIER: ${sd.sd_key}`);
  lines.push('╚══════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Title:    ${sd.title}`);
  lines.push(`Type:     ${sd.sd_type} | Status: ${sd.status} | Phase: ${sd.current_phase || 'N/A'}`);
  lines.push(`Priority: ${sd.priority || 'unset'} | Category: ${sd.category || 'N/A'}`);
  lines.push('');

  lines.push('── PRD ──────────────────────────────────────────────────────');
  if (prd) {
    lines.push(`  Title:  ${prd.title}`);
    lines.push(`  Status: ${prd.status}`);
    lines.push(`  Func Reqs: ${prd.functional_requirements?.length || 0} | Acceptance: ${prd.acceptance_criteria?.length || 0}`);
  } else {
    lines.push('  ⚠️  No PRD found');
  }
  lines.push('');

  lines.push('── BACKLOG ──────────────────────────────────────────────────');
  lines.push(`  Items: ${backlog.count}`);
  if (backlog.length > 0) {
    backlog.slice(0, 5).forEach(b => lines.push(`  • ${b.backlog_title || b.id}`));
  }
  lines.push('');

  lines.push('── DEPENDENCY GRAPH ─────────────────────────────────────────');
  if (graph.parent) lines.push(`  Parent:   ${graph.parent.sd_key} (${graph.parent.status})`);
  lines.push(`  Children: ${graph.children.length}`);
  graph.children.forEach(c => lines.push(`    • ${c.sd_key}: ${c.title} (${c.status})`));
  lines.push(`  Siblings: ${graph.siblings.length}`);
  lines.push('');

  lines.push('── SIMILAR SDs (Prior Art) ──────────────────────────────────');
  if (similarSDs.length === 0) {
    lines.push('  None found');
  } else {
    similarSDs.slice(0, 7).forEach(s =>
      lines.push(`  • [${s.relevanceScore || '?'}%] ${s.sd_key}: ${s.title} (${s.status})`)
    );
    if (similarSDs.length > 7) lines.push(`  ... and ${similarSDs.length - 7} more`);
  }
  lines.push('');

  lines.push('── RELATED RETROSPECTIVES ───────────────────────────────────');
  if (!relatedRetros || relatedRetros.length === 0) {
    lines.push('  No retrospectives from similar SDs');
  } else {
    relatedRetros.slice(0, 3).forEach(r => {
      lines.push(`  • ${r.sd_key} (quality: ${r.quality_score || 'N/A'}):`);
      if (r.key_learnings) {
        const learnings = typeof r.key_learnings === 'string' ? r.key_learnings : JSON.stringify(r.key_learnings);
        lines.push(`    Learnings: ${learnings.substring(0, 200)}`);
      }
    });
  }
  lines.push('');

  lines.push('── EVIDENCE ALIGNMENT ───────────────────────────────────────');
  if (evidenceCoverage && evidenceCoverage.results?.length > 0) {
    lines.push(`  Overall Coverage: ${evidenceCoverage.overallScore}%`);
    const stepNames = { 1: 'SD Metadata', 2: 'PRD', 3: 'Backlog', 4: 'Dependencies', 5: 'Similar SDs', 6: 'Evaluations' };
    evidenceCoverage.results.forEach(r => {
      const status = r.coverage_pct === 100 ? '✓' : r.coverage_pct > 0 ? '◐' : '✗';
      lines.push(`  ${status} ${r.gate_question_id}: ${r.gate_question_text}`);
      if (r.missing_steps.length > 0) {
        lines.push(`    Missing: ${r.missing_steps.map(s => stepNames[s] || s).join(', ')}`);
      }
    });
  } else {
    lines.push('  No evidence mapping available');
  }
  lines.push('');

  lines.push('── EVALUATION ───────────────────────────────────────────────');
  lines.push(`  Decision:       ${evaluation.final_decision}`);
  lines.push(`  Confidence:     ${evaluation.confidence_score}%`);
  lines.push(`  Business Value: ${evaluation.business_value} (${evaluation.business_value_score}/100)`);
  lines.push(`  Duplication:    ${evaluation.duplication_risk} (${evaluation.duplication_risk_score}/100)`);
  lines.push(`  Resource Cost:  ${evaluation.resource_cost} (${evaluation.resource_cost_score}/100)`);
  lines.push(`  Complexity:     ${evaluation.scope_complexity} (${evaluation.scope_complexity_score}/100)`);
  lines.push(`  Debt Impact:    ${evaluation.technical_debt_impact}`);
  lines.push(`  Dep. Risk:      ${evaluation.dependency_risk}`);
  lines.push(`  Evidence:       ${evaluation.evidence_coverage_score}%`);
  if (evaluation.required_actions?.length > 0) {
    lines.push('  Required Actions:');
    evaluation.required_actions.forEach(a => lines.push(`    ⚠️  ${a}`));
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));
  const dryRun = flags.includes('--dry-run');
  const jsonOutput = flags.includes('--json');

  const sdKey = positional[0];
  if (!sdKey) {
    console.error('Usage: npm run lead:dossier -- <SD-KEY> [--dry-run] [--json]');
    process.exit(1);
  }

  // 1. Fetch SD
  const sd = await fetchSD(sdKey);
  if (!sd) {
    console.error(`❌ SD not found: ${sdKey}`);
    process.exit(1);
  }

  // 2. Assemble dossier
  const [prd, backlog, existingEvals, graph, similarSDs] = await Promise.all([
    fetchPRD(sd.sd_key, sd.id),
    fetchBacklog(sd.sd_key),
    fetchExistingEvaluations(sd.id),
    fetchDependencyGraph(sd),
    fetchSimilarSDs(sd),
  ]);

  // 2b. Fetch related retrospectives from similar SDs
  const relatedRetros = await fetchRelatedRetros(similarSDs);

  // 2c. Fetch evidence-gate mapping and compute coverage
  const evidenceMapping = await fetchEvidenceMapping();
  const evidenceCoverage = computeEvidenceCoverage(sd, prd, backlog, graph, similarSDs, existingEvals, evidenceMapping);

  // 3. Derive evaluation
  const evaluation = deriveEvaluation(sd, prd, backlog, graph, similarSDs, evidenceCoverage.overallScore);

  const dossier = {
    sd: { id: sd.id, sd_key: sd.sd_key, title: sd.title, sd_type: sd.sd_type, status: sd.status,
          current_phase: sd.current_phase, priority: sd.priority, category: sd.category,
          description: sd.description, strategic_objectives: sd.strategic_objectives },
    prd: prd ? { id: prd.id, title: prd.title, status: prd.status,
                  functional_requirements_count: prd.functional_requirements?.length || 0,
                  acceptance_criteria_count: prd.acceptance_criteria?.length || 0 } : null,
    backlog: { count: backlog.length, items: backlog.slice(0, 10) },
    existingEvaluations: existingEvals,
    graph,
    similarSDs: similarSDs.slice(0, 10),
    relatedRetros,
    evidenceCoverage,
    evaluation,
  };

  // 4. Output
  if (jsonOutput) {
    console.log(JSON.stringify(dossier, null, 2));
  } else {
    console.log(formatSummary(dossier));
  }

  // 5. Persist (unless dry-run)
  if (!dryRun) {
    try {
      const persisted = await persistEvaluation(sd.id, evaluation);
      if (persisted) {
        console.log(`✅ Evaluation persisted: ${persisted.id} (decision: ${persisted.final_decision}, confidence: ${persisted.confidence_score}%)`);
      }
    } catch (err) {
      console.error(`❌ Failed to persist: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log('ℹ️  Dry run — evaluation not persisted');
  }
}

main().catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
