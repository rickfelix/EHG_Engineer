#!/usr/bin/env node
/**
 * Intelligent SD Baseline Generator
 *
 * Creates execution baselines with documented rationale using:
 * 1. Topological sort respecting dependencies
 * 2. Priority scoring based on OKRs, triage, and SD type
 * 3. GPT 5.2 analysis for rationale generation
 * 4. Track assignment for parallel execution
 *
 * Usage:
 *   npm run sd:baseline:intelligent           # Create baseline
 *   npm run sd:baseline:intelligent:preview   # Preview only
 *   npm run sd:baseline:intelligent:dry       # Show GPT analysis
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import readline from 'readline';

import {
  buildGraph,
  detectCycles,
  topologicalSortByPriority,
  getDependencyDepths,
  printGraphSummary,
} from './lib/dependency-graph.js';

import {
  calculatePriorityScore,
  calculateOKRImpact,
  rankSDs,
  assignTrack,
  printScoreSummary,
} from './lib/priority-scorer.js';

dotenv.config();

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

const ALGORITHM_VERSION = '1.0';

class IntelligentBaselineGenerator {
  constructor(options = {}) {
    this.options = {
      dryRun: options.dryRun || false,
      preview: options.preview || false,
      verbose: options.verbose || false,
      ...options,
    };

    this.sds = [];
    this.alignments = {};
    this.keyResults = new Map();
    this.objectives = new Map();
    this.graph = null;
    this.scores = {};
    this.ordering = [];
  }

  async run() {
    console.log(`\n${colors.cyan}${colors.bold}INTELLIGENT BASELINE GENERATOR${colors.reset}`);
    console.log(`${colors.dim}Algorithm Version: ${ALGORITHM_VERSION}${colors.reset}`);
    console.log('═'.repeat(60));

    // Check for existing active baseline
    if (!this.options.preview) {
      const hasBaseline = await this.checkExistingBaseline();
      if (hasBaseline) return;
    }

    // Phase 1: Data Collection
    console.log(`\n${colors.bold}Phase 1: Data Collection${colors.reset}`);
    await this.loadData();

    // Phase 2: Build Dependency Graph
    console.log(`\n${colors.bold}Phase 2: Dependency Analysis${colors.reset}`);
    await this.analyzeDependencies();

    // Phase 3: Priority Scoring
    console.log(`\n${colors.bold}Phase 3: Priority Scoring${colors.reset}`);
    await this.calculateScores();

    // Phase 4: Generate Ordering
    console.log(`\n${colors.bold}Phase 4: Generate Ordering${colors.reset}`);
    this.generateOrdering();

    // Phase 5: GPT Analysis
    console.log(`\n${colors.bold}Phase 5: GPT 5.2 Analysis${colors.reset}`);
    const gptResult = await this.analyzeWithGPT();

    if (this.options.preview) {
      console.log(`\n${colors.yellow}Preview mode - no baseline created${colors.reset}`);
      return;
    }

    if (this.options.dryRun) {
      console.log(`\n${colors.yellow}Dry run mode - no baseline created${colors.reset}`);
      return;
    }

    // Phase 6: Create Baseline
    console.log(`\n${colors.bold}Phase 6: Create Baseline${colors.reset}`);
    await this.createBaseline(gptResult);

    console.log(`\n${colors.green}${colors.bold}Baseline generation complete!${colors.reset}\n`);
  }

  async checkExistingBaseline() {
    const { data: existing } = await supabase
      .from('sd_execution_baselines')
      .select('id, baseline_name')
      .eq('is_active', true)
      .single();

    if (existing) {
      console.log(`\n${colors.yellow}Warning: Active baseline already exists: ${existing.baseline_name}${colors.reset}`);
      console.log('Use \'npm run sd:baseline rebaseline\' to create a new one.');
      console.log('Or use --preview to see what would be generated.\n');
      return true;
    }
    return false;
  }

  async loadData() {
    // Load active SDs
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select(`
        id, legacy_id, title, status, priority, sd_type, category,
        dependencies, sequence_rank, rolled_triage, readiness,
        must_have_pct, complexity_level, delivers_capabilities,
        modifies_capabilities, parent_sd_id, relationship_type
      `)
      .eq('is_active', true)
      .in('status', ['draft', 'active', 'in_progress', 'lead_review', 'plan_active', 'exec_active'])
      .order('sequence_rank', { nullsFirst: false });

    if (sdError) {
      throw new Error(`Failed to load SDs: ${sdError.message}`);
    }

    this.sds = sds || [];
    console.log(`  Loaded ${this.sds.length} active Strategic Directives`);

    // Load OKR alignments
    const { data: alignments } = await supabase
      .from('sd_key_result_alignment')
      .select('sd_id, key_result_id, contribution_type, contribution_weight, contribution_note');

    // Group by SD
    this.alignments = {};
    for (const a of alignments || []) {
      if (!this.alignments[a.sd_id]) {
        this.alignments[a.sd_id] = [];
      }
      this.alignments[a.sd_id].push(a);
    }
    console.log(`  Loaded ${(alignments || []).length} OKR alignments`);

    // Load Key Results
    const { data: krs } = await supabase
      .from('key_results')
      .select('id, code, title, status, objective_id, current_value, target_value');

    for (const kr of krs || []) {
      this.keyResults.set(kr.id, kr);
    }
    console.log(`  Loaded ${this.keyResults.size} Key Results`);

    // Load Objectives
    const { data: objs } = await supabase
      .from('objectives')
      .select('id, code, title');

    for (const obj of objs || []) {
      this.objectives.set(obj.id, obj);
    }
    console.log(`  Loaded ${this.objectives.size} Objectives`);
  }

  async analyzeDependencies() {
    // Build graph
    this.graph = buildGraph(this.sds);

    // Check for cycles
    const cycles = detectCycles(this.graph);
    if (cycles.length > 0) {
      console.log(`\n${colors.red}ERROR: Circular dependencies detected!${colors.reset}`);
      for (const cycle of cycles) {
        console.log(`  ${cycle.join(' → ')}`);
      }
      throw new Error('Cannot create baseline with circular dependencies');
    }

    console.log(`  ${colors.green}No circular dependencies detected${colors.reset}`);
    console.log(`  Graph: ${this.graph.nodes.size} nodes, ${this.graph.edges.length} edges`);

    // Get depths
    this.depths = getDependencyDepths(this.graph);
    const maxDepth = Math.max(...this.depths.values());
    console.log(`  Max dependency depth: ${maxDepth}`);

    if (this.options.verbose) {
      printGraphSummary(this.graph);
    }
  }

  async calculateScores() {
    for (const sd of this.sds) {
      const alignments = this.alignments[sd.legacy_id] || [];
      const score = calculatePriorityScore(sd, alignments, this.keyResults);
      this.scores[sd.legacy_id] = score.total;

      if (this.options.verbose) {
        console.log(`  ${sd.legacy_id}: ${score.total} pts`);
        console.log(`    ${colors.dim}${score.details.priority}, ${score.details.okrImpact}${colors.reset}`);
      }
    }

    // Show top 5
    const sorted = Object.entries(this.scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    console.log('  Top 5 by priority score:');
    for (const [sdId, score] of sorted) {
      const sd = this.sds.find(s => s.legacy_id === sdId);
      console.log(`    [${score}] ${sdId} (${sd?.sd_type || 'unknown'})`);
    }
  }

  generateOrdering() {
    // Use topological sort with priority
    this.ordering = topologicalSortByPriority(this.graph, this.scores);
    console.log(`  Generated ordering for ${this.ordering.length} SDs`);

    // Show first 10
    console.log('  Execution order (first 10):');
    this.ordering.slice(0, 10).forEach((sdId, index) => {
      const sd = this.sds.find(s => s.legacy_id === sdId);
      const score = this.scores[sdId] || 0;
      const track = assignTrack(sd);
      console.log(`    ${index + 1}. ${sdId} [${score}pts] → Track ${track.track}`);
    });
  }

  async analyzeWithGPT() {
    console.log('  Sending to GPT 5.2 for analysis...');

    // Build prompt
    const prompt = this.buildGPTPrompt();

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5.2',
        max_completion_tokens: 4000,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are a strategic planning AI that analyzes Strategic Directives and provides execution sequencing recommendations with documented rationale. Output valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.choices[0].message.content;

      // Parse JSON response
      let result;
      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                          content.match(/```\s*([\s\S]*?)\s*```/) ||
                          [null, content];
        result = JSON.parse(jsonMatch[1] || content);
      } catch (parseError) {
        console.log(`${colors.yellow}Warning: Could not parse GPT response as JSON${colors.reset}`);
        console.log(`${colors.dim}${content.substring(0, 500)}...${colors.reset}`);

        // Create fallback result
        result = this.createFallbackResult();
      }

      console.log(`  ${colors.green}GPT analysis complete${colors.reset}`);

      if (result.baseline_rationale) {
        console.log(`\n  ${colors.cyan}Overall Strategy:${colors.reset}`);
        console.log(`  ${colors.dim}${result.baseline_rationale.substring(0, 200)}...${colors.reset}`);
      }

      return result;
    } catch (error) {
      console.log(`${colors.yellow}Warning: GPT analysis failed: ${error.message}${colors.reset}`);
      return this.createFallbackResult();
    }
  }

  buildGPTPrompt() {
    // Build SD list with context
    const sdList = this.ordering.map((sdId, index) => {
      const sd = this.sds.find(s => s.legacy_id === sdId);
      const score = this.scores[sdId] || 0;
      const alignments = this.alignments[sdId] || [];
      const depth = this.depths.get(sdId) || 0;
      const track = assignTrack(sd);

      // Get aligned KR codes
      const krCodes = alignments.map(a => {
        const kr = this.keyResults.get(a.key_result_id);
        return kr ? `${kr.code}(${a.contribution_type})` : null;
      }).filter(Boolean);

      const node = this.graph.nodes.get(sdId);
      const deps = node?.inEdges?.join(', ') || 'none';

      return {
        rank: index + 1,
        sd_id: sdId,
        title: sd?.title?.substring(0, 50) || '',
        type: sd?.sd_type || 'unknown',
        priority: sd?.priority || 'medium',
        triage: sd?.rolled_triage || '',
        score,
        depth,
        suggested_track: track.track,
        dependencies: deps,
        aligned_krs: krCodes.join(', ') || 'none',
      };
    });

    // Build dependencies graph summary
    const depsSummary = [];
    for (const [sdId, node] of this.graph.nodes) {
      if (node.inEdges.length > 0) {
        depsSummary.push(`${sdId} ← ${node.inEdges.join(', ')}`);
      }
    }

    return `## Strategic Directive Sequencing Analysis

You are analyzing Strategic Directives for an AI-powered venture management system.
Your task is to validate the proposed execution order and provide documented rationale.

### Q1 2026 OKRs Context
- O1-TRUTH-ENGINE: Ship "The Truth Engine" (Tier 2) MVP
  - KR1.1-TECH-ARCH: Finalize tech architecture by Jan 31
  - KR1.2-SOFT-LAUNCH: Soft launch by Feb 14
  - KR1.3-PUBLIC-LAUNCH: Public launch by Mar 1
  - KR1.4-COMMERCE-STACK: Payment integration
- O2-COMMERCIAL: Validate Commercial Viability
  - KR2.1-PAID-USERS: 15 paid users by Mar 31
  - KR2.2-ZERO-TOUCH: 90%+ zero-touch support
  - KR2.3-TESTIMONIALS: 5 verified testimonials
- O3-CAPACITY: Maintain Founder Operational Capacity
  - KR3.1-HARD-STOP: 11:00 PM cutoff 100% compliance
  - KR3.2-SUNDAY-AUDIT: Weekly audit compliance
  - KR3.3-UPTIME: 100% operational

### SDs to Sequence (${sdList.length} total, pre-sorted by algorithm)

${JSON.stringify(sdList.slice(0, 20), null, 2)}

### Dependencies Graph
${depsSummary.slice(0, 15).join('\n') || '(no dependencies)'}

### Instructions
1. Review the proposed ordering (already respects dependencies)
2. For each SD, provide a 1-2 sentence rationale explaining its position
3. Confirm or adjust track assignment (A=Infrastructure, B=Feature, C=Quality, STANDALONE)
4. Provide an overall baseline strategy summary

### Output Format (JSON)
{
  "baseline_rationale": "Overall strategy summary explaining the sequencing approach...",
  "sequence": [
    {
      "sd_id": "SD-XXX",
      "sequence_rank": 1,
      "track": "A",
      "rationale": "Explanation of why this SD is in this position..."
    }
  ]
}

Important: Output ONLY valid JSON, no additional text.`;
  }

  createFallbackResult() {
    return {
      baseline_rationale: 'Baseline generated using algorithmic priority scoring and topological ordering. GPT analysis unavailable.',
      sequence: this.ordering.map((sdId, index) => {
        const sd = this.sds.find(s => s.legacy_id === sdId);
        const track = assignTrack(sd);
        const depth = this.depths.get(sdId) || 0;
        const score = this.scores[sdId] || 0;

        return {
          sd_id: sdId,
          sequence_rank: index + 1,
          track: track.track,
          rationale: `Priority score: ${score}. Dependency depth: ${depth}. Type: ${sd?.sd_type || 'unknown'}.`,
        };
      }),
    };
  }

  async createBaseline(gptResult) {
    const baselineName = `${new Date().toISOString().split('T')[0]} Intelligent Baseline`;

    // Create baseline record
    const { data: baseline, error: baselineError } = await supabase
      .from('sd_execution_baselines')
      .insert({
        baseline_name: baselineName,
        baseline_type: 'intelligent',
        is_active: true,
        created_by: 'LEAD',
        approved_by: 'LEAD',
        approved_at: new Date().toISOString(),
        notes: `Intelligent baseline with ${this.ordering.length} SDs`,
        generation_rationale: gptResult.baseline_rationale,
        generated_by: 'gpt-5.2',
        algorithm_version: ALGORITHM_VERSION,
        generation_metadata: {
          sd_count: this.ordering.length,
          algorithm_version: ALGORITHM_VERSION,
          generated_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (baselineError) {
      throw new Error(`Failed to create baseline: ${baselineError.message}`);
    }

    console.log(`  ${colors.green}Created baseline: ${baseline.baseline_name}${colors.reset}`);

    // Create baseline items and rationale
    const items = [];
    const rationales = [];

    // Build lookup from GPT result
    const gptSequence = {};
    for (const item of gptResult.sequence || []) {
      gptSequence[item.sd_id] = item;
    }

    for (let i = 0; i < this.ordering.length; i++) {
      const sdId = this.ordering[i];
      const sd = this.sds.find(s => s.legacy_id === sdId);
      const gptItem = gptSequence[sdId] || {};
      const track = gptItem.track || assignTrack(sd).track;
      const trackName = track === 'A' ? 'Infrastructure/Safety' :
                        track === 'B' ? 'Feature/Stages' :
                        track === 'C' ? 'Quality' : 'Standalone';

      const depth = this.depths.get(sdId) || 0;
      const node = this.graph.nodes.get(sdId);
      const blockedBy = node?.inEdges || [];

      // Baseline item
      items.push({
        baseline_id: baseline.id,
        sd_id: sdId,
        sequence_rank: i + 1,
        track,
        track_name: trackName,
        dependencies_snapshot: sd?.dependencies,
        dependency_health_score: blockedBy.length === 0 ? 1.0 : 0.0,
        is_ready: blockedBy.length === 0,
        notes: gptItem.rationale?.substring(0, 200),
      });

      // Rationale record
      const alignments = this.alignments[sdId] || [];
      const okrImpact = calculateOKRImpact(alignments, this.keyResults);

      rationales.push({
        baseline_id: baseline.id,
        sd_id: sdId,
        sequence_rank: i + 1,
        track,
        track_name: trackName,
        rationale: gptItem.rationale || `Priority score: ${this.scores[sdId]}. Dependency depth: ${depth}.`,
        priority_score: this.scores[sdId],
        okr_impact_score: okrImpact.totalScore,
        dependency_depth: depth,
        dependencies_count: blockedBy.length,
        blocked_by: blockedBy.length > 0 ? blockedBy : null,
        generated_by: gptResult.baseline_rationale ? 'gpt-5.2' : 'algorithm',
        algorithm_version: ALGORITHM_VERSION,
      });
    }

    // Insert baseline items
    const { error: itemsError } = await supabase
      .from('sd_baseline_items')
      .insert(items);

    if (itemsError) {
      console.log(`${colors.yellow}Warning: Could not insert baseline items: ${itemsError.message}${colors.reset}`);
    } else {
      console.log(`  Created ${items.length} baseline items`);
    }

    // Insert rationale records
    const { error: rationaleError } = await supabase
      .from('sd_baseline_rationale')
      .insert(rationales);

    if (rationaleError) {
      console.log(`${colors.yellow}Warning: Could not insert rationale records: ${rationaleError.message}${colors.reset}`);
    } else {
      console.log(`  Created ${rationales.length} rationale records`);
    }

    // Create execution actuals
    const actuals = this.sds.map(sd => ({
      sd_id: sd.legacy_id,
      baseline_id: baseline.id,
      status: sd.progress_percentage > 0 ? 'in_progress' : 'not_started',
    }));

    await supabase.from('sd_execution_actuals').insert(actuals);

    // Display summary
    this.displayBaselineSummary(baseline, gptResult);
  }

  displayBaselineSummary(baseline, gptResult) {
    console.log(`\n${colors.cyan}${colors.bold}GENERATED BASELINE${colors.reset}`);
    console.log('─'.repeat(60));

    // Group by track
    const byTrack = { A: [], B: [], C: [], STANDALONE: [] };
    for (let i = 0; i < this.ordering.length; i++) {
      const sdId = this.ordering[i];
      const sd = this.sds.find(s => s.legacy_id === sdId);
      const gptItem = (gptResult.sequence || []).find(s => s.sd_id === sdId) || {};
      const track = gptItem.track || assignTrack(sd).track;

      byTrack[track] = byTrack[track] || [];
      byTrack[track].push({
        rank: i + 1,
        sdId,
        title: sd?.title?.substring(0, 40),
        rationale: gptItem.rationale,
      });
    }

    const trackColors = { A: colors.magenta, B: colors.blue, C: colors.cyan, STANDALONE: colors.yellow };
    const trackNames = { A: 'Infrastructure', B: 'Features', C: 'Quality', STANDALONE: 'Standalone' };

    for (const [track, items] of Object.entries(byTrack)) {
      if (items.length === 0) continue;

      console.log(`\n${trackColors[track]}${colors.bold}Track ${track}: ${trackNames[track]} (${items.length} SDs)${colors.reset}`);

      for (const item of items.slice(0, 5)) {
        console.log(`  [${item.rank}] ${item.sdId}`);
        if (item.rationale) {
          console.log(`      ${colors.dim}${item.rationale.substring(0, 80)}${colors.reset}`);
        }
      }

      if (items.length > 5) {
        console.log(`  ${colors.dim}... and ${items.length - 5} more${colors.reset}`);
      }
    }

    console.log(`\n${colors.green}Baseline: ${baseline.baseline_name}${colors.reset}`);
    console.log(`${colors.dim}Rationale stored for ${this.ordering.length} SDs${colors.reset}`);
  }
}

// Parse command line args
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run') || args.includes('-d'),
  preview: args.includes('--preview') || args.includes('-p'),
  verbose: args.includes('--verbose') || args.includes('-v'),
};

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.bold}Intelligent SD Baseline Generator${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npm run sd:baseline:intelligent           Create intelligent baseline
  npm run sd:baseline:intelligent:preview   Preview without creating
  npm run sd:baseline:intelligent:dry       Show GPT analysis (dry run)

${colors.cyan}Options:${colors.reset}
  --preview, -p    Preview mode (no changes)
  --dry-run, -d    Dry run (shows analysis but doesn't create)
  --verbose, -v    Show detailed output
  --help, -h       Show this help

${colors.cyan}What it does:${colors.reset}
  1. Loads active SDs with dependencies and OKR alignments
  2. Builds dependency graph and detects cycles
  3. Calculates priority scores (priority, triage, OKR impact, type)
  4. Generates topologically-valid ordering by priority
  5. Uses GPT 5.2 to analyze and generate rationale
  6. Creates baseline with documented justification

${colors.cyan}Algorithm:${colors.reset}
  Score = Priority(0-40) + Triage(0-30) + OKR(0-50) + Type(0-20) + Readiness(0-10)
  Max: ~150 points
`);
  process.exit(0);
}

// Run
const generator = new IntelligentBaselineGenerator(options);
generator.run().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  if (options.verbose) {
    console.error(err.stack);
  }
  process.exit(1);
});
