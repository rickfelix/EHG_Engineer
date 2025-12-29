#!/usr/bin/env node
/**
 * Pattern Detection Engine
 * Automatically analyzes retrospectives, handoffs, and execution history
 * to detect recurring issues and extract proven solutions
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export class PatternDetectionEngine {
  constructor() {
    this.similarityThreshold = 0.7; // 70% similarity to consider a match
    this.minOccurrencesForPattern = 2; // Need 2+ occurrences to create pattern
    this.obsoleteThresholdDays = 30; // Mark as obsolete if no occurrences in 30 days
  }

  /**
   * Main analysis function - analyzes a completed SD for patterns
   */
  async analyzeSD(sdId) {
    console.log(`\n🔍 Analyzing SD ${sdId} for patterns...`);

    const results = {
      sd_id: sdId,
      issues_found: [],
      patterns_matched: [],
      patterns_updated: [],
      patterns_created: [],
      prevention_opportunities: []
    };

    try {
      // 1. Extract issues from all sources
      const issues = await this.extractIssuesFromSD(sdId);
      results.issues_found = issues;

      // 2. Match against existing patterns
      for (const issue of issues) {
        const pattern = await this.findMatchingPattern(issue);

        if (pattern) {
          // Update existing pattern
          await this.updatePattern(pattern.id, issue, sdId);
          results.patterns_matched.push(pattern.pattern_id);
          results.patterns_updated.push({
            pattern_id: pattern.pattern_id,
            new_occurrence_count: pattern.occurrence_count + 1
          });
        } else {
          // Check if this could be a new pattern
          const similarIssues = await this.findSimilarIssues(issue);
          if (similarIssues.length >= this.minOccurrencesForPattern) {
            const newPattern = await this.createPattern(issue, similarIssues, sdId);
            results.patterns_created.push(newPattern);
          }
        }
      }

      // 3. Analyze for prevention opportunities
      results.prevention_opportunities = await this.identifyPreventionOpportunities(sdId, issues);

      // 4. Update pattern trends
      await this.updatePatternTrends();

      console.log(`✅ Analysis complete: ${results.patterns_matched.length} matched, ${results.patterns_created.length} created`);
      return results;

    } catch (error) {
      console.error('Error analyzing SD:', error);
      throw error;
    }
  }

  /**
   * Extract issues from retrospective, handoffs, and execution history
   */
  async extractIssuesFromSD(sdId) {
    const issues = [];

    // Get SD details
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('id', sdId)
      .single();

    if (!sd) return issues;

    // 1. Extract from retrospective
    const { data: retro } = await supabase
      .from('retrospectives')
      .select('what_needs_improvement, key_learnings, action_items')
      .eq('strategic_directive_id', sdId)
      .single();

    if (retro?.what_needs_improvement) {
      for (const item of retro.what_needs_improvement) {
        issues.push({
          source: 'retrospective',
          type: 'challenge',
          description: typeof item === 'string' ? item : item.issue || item,
          sd_id: sdId,
          sd_key: sd.sd_key
        });
      }
    }

    // 2. Extract from handoff documents (markdown files)
    try {
      const handoffDir = path.join(process.cwd(), 'handoffs');
      const files = await fs.readdir(handoffDir);
      const sdHandoffs = files.filter(f => f.includes(sd.sd_key));

      for (const file of sdHandoffs) {
        const content = await fs.readFile(path.join(handoffDir, file), 'utf-8');
        const knownIssues = this.extractKnownIssuesFromHandoff(content);
        issues.push(...knownIssues.map(issue => ({
          source: 'handoff',
          type: 'known_issue',
          description: issue,
          sd_id: sdId,
          sd_key: sd.sd_key,
          file: file
        })));
      }
    } catch (_error) {
      console.log('No handoff files found or error reading them');
    }

    // 3. Extract from sub-agent executions
    const { data: executions } = await supabase
      .from('sub_agent_executions')
      .select('verdict, findings, sub_agent:leo_sub_agents(name)')
      .or(`trigger_context->sd_id.eq.${sdId},trigger_context->sd_key.eq.${sd.sd_key}`)
      .eq('verdict', 'FAIL');

    if (executions) {
      for (const exec of executions) {
        if (exec.findings) {
          issues.push({
            source: 'sub_agent',
            type: 'verification_failure',
            description: typeof exec.findings === 'string' ? exec.findings : JSON.stringify(exec.findings),
            sub_agent: exec.sub_agent?.name,
            sd_id: sdId,
            sd_key: sd.sd_key
          });
        }
      }
    }

    return issues;
  }

  /**
   * Extract known issues from handoff markdown content
   */
  extractKnownIssuesFromHandoff(content) {
    const issues = [];
    const knownIssuesSection = content.match(/###\s*Known Issues.*?\n([\s\S]*?)(?=\n###|$)/i);

    if (knownIssuesSection) {
      const bullets = knownIssuesSection[1].match(/^[-*]\s+(.+)$/gm);
      if (bullets) {
        issues.push(...bullets.map(b => b.replace(/^[-*]\s+/, '').trim()));
      }
    }

    return issues;
  }

  /**
   * Find matching pattern for an issue using similarity
   */
  async findMatchingPattern(issue) {
    const { data: patterns } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('status', 'active');

    if (!patterns) return null;

    // Calculate similarity for each pattern
    for (const pattern of patterns) {
      const similarity = this.calculateSimilarity(
        issue.description.toLowerCase(),
        pattern.issue_summary.toLowerCase()
      );

      if (similarity >= this.similarityThreshold) {
        return pattern;
      }
    }

    return null;
  }

  /**
   * Simple similarity calculation (Jaccard similarity on words)
   */
  calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Find similar issues across historical data
   */
  async findSimilarIssues(issue) {
    const { data: retros } = await supabase
      .from('retrospectives')
      .select('what_needs_improvement, strategic_directive_id')
      .not('strategic_directive_id', 'eq', issue.sd_id);

    const similarIssues = [];

    if (retros) {
      for (const retro of retros) {
        if (!retro.what_needs_improvement) continue;

        for (const item of retro.what_needs_improvement) {
          const description = typeof item === 'string' ? item : item.issue || item;
          const similarity = this.calculateSimilarity(
            issue.description.toLowerCase(),
            description.toLowerCase()
          );

          if (similarity >= this.similarityThreshold) {
            similarIssues.push({
              description,
              sd_id: retro.strategic_directive_id,
              similarity
            });
          }
        }
      }
    }

    return similarIssues;
  }

  /**
   * Update existing pattern with new occurrence
   */
  async updatePattern(patternId, issue, sdId) {
    const { data: pattern } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('id', patternId)
      .single();

    if (!pattern) return;

    // Increment occurrence count
    const newCount = pattern.occurrence_count + 1;

    // Update last_seen
    const updates = {
      occurrence_count: newCount,
      last_seen_sd_id: sdId,
      updated_at: new Date().toISOString()
    };

    await supabase
      .from('issue_patterns')
      .update(updates)
      .eq('id', patternId);

    console.log(`  📊 Updated pattern ${pattern.pattern_id}: ${newCount} occurrences`);
  }

  /**
   * Create new pattern from recurring issue
   */
  async createPattern(issue, similarIssues, sdId) {
    // Generate pattern ID
    const { data: lastPattern } = await supabase
      .from('issue_patterns')
      .select('pattern_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let patternNum = 1;
    if (lastPattern) {
      const match = lastPattern.pattern_id.match(/PAT-(\d+)/);
      if (match) {
        patternNum = parseInt(match[1]) + 1;
      }
    }

    const patternId = `PAT-${String(patternNum).padStart(3, '0')}`;

    // Categorize the issue
    const category = this.categorizeIssue(issue.description);

    // Create pattern record
    const pattern = {
      pattern_id: patternId,
      category,
      issue_summary: issue.description,
      occurrence_count: similarIssues.length + 1,
      first_seen_sd_id: similarIssues[0]?.sd_id || sdId,
      last_seen_sd_id: sdId,
      severity: this.assessSeverity(issue),
      proven_solutions: [],
      status: 'active',
      trend: 'stable'
    };

    const { data, error } = await supabase
      .from('issue_patterns')
      .insert([pattern])
      .select()
      .single();

    if (error) {
      console.error('Error creating pattern:', error);
      return null;
    }

    console.log(`  ✨ Created new pattern ${patternId}: ${category}`);
    return data;
  }

  /**
   * Categorize issue based on keywords
   */
  categorizeIssue(description) {
    const lower = description.toLowerCase();

    if (lower.includes('schema') || lower.includes('database') || lower.includes('table')) {
      return 'database';
    }
    if (lower.includes('test') || lower.includes('spec') || lower.includes('playwright')) {
      return 'testing';
    }
    if (lower.includes('build') || lower.includes('compile') || lower.includes('vite')) {
      return 'build';
    }
    if (lower.includes('ci') || lower.includes('cd') || lower.includes('pipeline') || lower.includes('deploy')) {
      return 'deployment';
    }
    if (lower.includes('component') || lower.includes('import') || lower.includes('path')) {
      return 'code_structure';
    }
    if (lower.includes('auth') || lower.includes('rls') || lower.includes('permission')) {
      return 'security';
    }
    if (lower.includes('sub-agent') || lower.includes('subagent')) {
      return 'protocol';
    }

    return 'general';
  }

  /**
   * Assess severity of issue
   */
  assessSeverity(issue) {
    const lower = issue.description.toLowerCase();

    if (lower.includes('critical') || lower.includes('blocker') || lower.includes('security')) {
      return 'critical';
    }
    if (lower.includes('error') || lower.includes('fail') || lower.includes('broke')) {
      return 'high';
    }
    if (lower.includes('slow') || lower.includes('warning') || lower.includes('confusing')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Identify prevention opportunities
   */
  async identifyPreventionOpportunities(sdId, issues) {
    const opportunities = [];

    // Group issues by category
    const byCategory = {};
    for (const issue of issues) {
      const category = this.categorizeIssue(issue.description);
      if (!byCategory[category]) byCategory[category] = [];
      byCategory[category].push(issue);
    }

    // If multiple issues in same category, suggest prevention
    for (const [category, categoryIssues] of Object.entries(byCategory)) {
      if (categoryIssues.length >= 2) {
        opportunities.push({
          category,
          issue_count: categoryIssues.length,
          suggestion: this.getPreventionSuggestion(category),
          priority: 'high'
        });
      }
    }

    return opportunities;
  }

  /**
   * Get prevention suggestion for category
   */
  getPreventionSuggestion(category) {
    const suggestions = {
      database: 'Add schema verification to EXEC pre-implementation checklist',
      testing: 'Create automated test suite for this component type',
      build: 'Document build configuration in README',
      deployment: 'Add deployment checklist to handoff template',
      code_structure: 'Create code organization guidelines',
      security: 'Add security review to PLAN verification phase',
      protocol: 'Update sub-agent triggers or documentation'
    };

    return suggestions[category] || 'Document pattern and add to troubleshooting guide';
  }

  /**
   * Update trends for all patterns
   */
  async updatePatternTrends() {
    const { data: patterns } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('status', 'active');

    if (!patterns) return;

    for (const pattern of patterns) {
      const trend = await this.calculateTrend(pattern);
      const status = await this.determineStatus(pattern);

      await supabase
        .from('issue_patterns')
        .update({ trend, status, updated_at: new Date().toISOString() })
        .eq('id', pattern.id);
    }
  }

  /**
   * Calculate trend based on recent occurrences
   */
  async calculateTrend(pattern) {
    // Get occurrences in last 30 days vs previous 30 days
    // For now, simplified implementation
    const daysSinceLastOccurrence = pattern.updated_at
      ? (Date.now() - new Date(pattern.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    if (daysSinceLastOccurrence > 30) return 'decreasing';
    if (daysSinceLastOccurrence < 7) return 'increasing';
    return 'stable';
  }

  /**
   * Determine if pattern should be marked as resolved
   */
  async determineStatus(pattern) {
    const daysSinceLastOccurrence = pattern.updated_at
      ? (Date.now() - new Date(pattern.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      : 0;

    if (daysSinceLastOccurrence > this.obsoleteThresholdDays) {
      return 'obsolete';
    }

    return 'active';
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const sdId = process.argv[2];

  if (!sdId) {
    console.error('Usage: node pattern-detection-engine.js <SD_UUID>');
    process.exit(1);
  }

  const engine = new PatternDetectionEngine();
  engine.analyzeSD(sdId)
    .then(results => {
      console.log('\n📊 Analysis Results:');
      console.log(JSON.stringify(results, null, 2));
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export default PatternDetectionEngine;
