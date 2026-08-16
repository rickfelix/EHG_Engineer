#!/usr/bin/env node
/**
 * Issue Knowledge Base
 * Persistent, searchable index of all known issues and their solutions
 * Provides fast lookup and retrieval of historical problem-solving data
 */

import { createHash } from 'node:crypto';
import { lazyServiceClient } from '../supabase-client.js';
import { evaluateQuarantineRefusal, loadQuarantineManifest } from './quarantine-refusal.js';
import dotenv from 'dotenv';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: issue_patterns is a
// named growing table; these full/active-scope scans feed search ranking, category
// grouping, and KB statistics — a capped read would silently drop candidate patterns.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

dotenv.config();

// Field delimiter for the pattern_id fingerprint below. ASCII 0x1F (UNIT SEPARATOR) is used
// literally for this job and cannot occur in the free-text fields it separates, so the field
// boundaries are unambiguous: joining on a space would hash ('a b', 'c') and ('a', 'b c')
// identically, and a fingerprint collision here destroys a lesson — the exact failure this
// module was fixed to stop causing.
//
// Written as an ESCAPE on purpose. An earlier revision of this line carried the separator as a
// raw control byte, which was invisible in the source and made the whole file test as BINARY:
// ripgrep reported "binary file matches" and silently omitted it from every repo-wide search,
// including the absence checks used to verify this very SD. A source file must say what it does.
// Guarded by tests/unit/no-nul-bytes-in-source.test.js.
const FIELD_SEP = '\u001f';

// Lazy service client: defers env-var validation to first method call so
// module-load doesn't crash vitest collection in CI without secrets.
const supabase = lazyServiceClient();

export class IssueKnowledgeBase {
  constructor() {
    this.minSimilarity = 0.15; // 15% minimum for search results (Jaccard similarity is strict)
  }

  /**
   * Search for similar issues with ranking
   */
  async search(query, options = {}) {
    const {
      limit = 10,
      category = null,
      minSuccessRate = 0,
      includeObsolete = false
    } = options;

    console.log(`\n🔍 Searching knowledge base for: "${query}"`);

    try {
      // Build query, paginated to completion (fresh builder per page)
      const patterns = await fetchAllPaginated(() => {
        let qb = supabase.from('issue_patterns').select('*');
        if (!includeObsolete) qb = qb.eq('status', 'active');
        if (category) qb = qb.eq('category', category);
        return qb.order('id', { ascending: true });
      });

      if (patterns.length === 0) {
        console.log('  ℹ️  No patterns found in database');
        return [];
      }

      // Calculate similarity scores
      const results = patterns.map(pattern => {
        const similarity = this.calculateSimilarity(
          query.toLowerCase(),
          pattern.issue_summary.toLowerCase()
        );

        const successRate = this.calculateSuccessRate(pattern);
        const recency = this.calculateRecencyScore(pattern);

        // Weighted ranking score
        const score = (
          similarity * 0.4 +
          recency * 0.2 +
          successRate * 0.3 +
          (1 / (pattern.occurrence_count + 1)) * 0.1 // Prefer less common = more specific
        );

        return {
          ...pattern,
          similarity,
          success_rate: successRate * 100,
          recency_score: recency,
          overall_score: score
        };
      });

      // Filter by minimum similarity
      const filtered = results.filter(r =>
        r.similarity >= this.minSimilarity &&
        r.success_rate >= minSuccessRate
      );

      // Sort by overall score
      filtered.sort((a, b) => b.overall_score - a.overall_score);

      const topResults = filtered.slice(0, limit);

      console.log(`  ✅ Found ${topResults.length} matching patterns`);
      return topResults;

    } catch (error) {
      console.error('Error searching knowledge base:', error);
      throw error;
    }
  }

  /**
   * Get specific pattern by ID
   */
  async getPattern(patternId) {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('pattern_id', patternId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get solution details for a pattern
   */
  async getSolution(patternId) {
    const pattern = await this.getPattern(patternId);

    // QF-20260525-885: proven_solutions may arrive as a non-array jsonb value
    // (object/string); Array.isArray guards the .sort() below from throwing.
    if (!pattern || !Array.isArray(pattern.proven_solutions) || pattern.proven_solutions.length === 0) {
      return null;
    }

    // Return highest success rate solution
    const solutions = pattern.proven_solutions;
    solutions.sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));

    // SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-5): a 0%-success (disproven/quarantine-refused)
    // entry must never be served as recommended_solution, regardless of array position, ties, or
    // sort behavior -- with no floor, a single-entry array (or any state where the sort doesn't
    // run) could still hand back a masked non-fix as "the answer". This is the read-side half of
    // the same defect class FR-4 closes on the write side: fixing only the write path leaves a
    // 0%-success entry that predates this SD (or slips through some other write path) still
    // servable here.
    const top = solutions[0];
    const recommendedSolution = top && (top.success_rate || 0) > 0 ? top : null;

    return {
      pattern_id: pattern.pattern_id,
      category: pattern.category,
      issue: pattern.issue_summary,
      recommended_solution: recommendedSolution,
      alternative_solutions: solutions.slice(1),
      prevention_checklist: pattern.prevention_checklist || []
    };
  }

  /**
   * Record new occurrence of an issue
   */
  async recordOccurrence(data) {
    const {
      pattern_id,
      sd_id,
      solution_applied,
      resolution_time_minutes,
      was_successful = true,
      found_via_search = false,
      // SD-LEO-INFRA-CLOCK-SKEW-CI-SWEEP-001 (FR-4): additive, optional. Absent/empty is fully
      // backward-compatible -- callers that don't supply it behave exactly as before this SD.
      target_test_paths = []
    } = data;

    // Evaluated once, lazily (only when the caller actually supplied candidate paths) so callers
    // that don't pass target_test_paths pay zero extra I/O. A missing/malformed manifest fails
    // LOUD via loadQuarantineManifest (never silently "nothing is quarantined").
    const quarantineCheck = target_test_paths.length > 0
      ? evaluateQuarantineRefusal({ targetTestPaths: target_test_paths, manifest: loadQuarantineManifest() })
      : { refused: false, reason: null, matchedPath: null };
    // was_successful DEFAULTS to true at the only live caller (scripts/auto-extract-patterns-
    // from-retro.js) -- this guard must key on the quarantine check itself, never rely on a
    // caller remembering to pass false.
    const effectiveSuccessful = was_successful && !quarantineCheck.refused;

    console.log(`\n📝 Recording occurrence for pattern ${pattern_id}...`);

    // Get existing pattern
    const pattern = await this.getPattern(pattern_id);
    if (!pattern) {
      console.error(`  ❌ Pattern ${pattern_id} not found`);
      return null;
    }

    // Update occurrence count
    const newCount = pattern.occurrence_count + 1;

    // Update proven solutions
    // QF-20260525-885: coerce non-array proven_solutions to [] so .find() below is safe.
    let solutions = Array.isArray(pattern.proven_solutions) ? pattern.proven_solutions : [];
    // QF-20260808-463: the line above guards the CONTAINER; this one used to assume the CONTENTS.
    // `s.solution.toLowerCase is not a function` threw here and killed the whole update — the
    // upstream extractor writes `solution: retro.action_items[0]`, and an action item is very
    // often an OBJECT, not a string. `solution_applied` can arrive non-string the same way.
    //
    // Deliberately NOT `String(v).toLowerCase()`: that stringifies every object to
    // '[object Object]', so two unrelated object-valued solutions would compare EQUAL and get
    // silently merged into one another's stats. A crash replaced by a wrong merge is worse than
    // the crash, because the merge is silent. A non-string simply cannot match, and a non-string
    // target matches nothing at all.
    const lower = (v) => (typeof v === 'string' ? v.toLowerCase() : null);
    const target = lower(solution_applied);
    const existingSolution = target === null
      ? undefined
      : solutions.find(s => s && lower(s.solution) === target);

    if (existingSolution) {
      // Update existing solution stats
      existingSolution.times_applied = (existingSolution.times_applied || 0) + 1;
      if (effectiveSuccessful) {
        existingSolution.times_successful = (existingSolution.times_successful || 0) + 1;
      }
      existingSolution.success_rate =
        (existingSolution.times_successful / existingSolution.times_applied) * 100;
      if (quarantineCheck.refused) {
        existingSolution.quarantine_refusal_reason = quarantineCheck.reason;
      }

      // Update average resolution time
      const totalTime = (existingSolution.avg_resolution_time_minutes || 0) *
                        ((existingSolution.times_applied || 1) - 1);
      existingSolution.avg_resolution_time_minutes =
        (totalTime + resolution_time_minutes) / existingSolution.times_applied;
    } else {
      // Add new solution
      const newSolution = {
        solution: solution_applied,
        times_applied: 1,
        times_successful: effectiveSuccessful ? 1 : 0,
        success_rate: effectiveSuccessful ? 100 : 0,
        avg_resolution_time_minutes: resolution_time_minutes,
        first_used_sd_id: sd_id,
        found_via_search
      };
      if (quarantineCheck.refused) {
        newSolution.quarantine_refusal_reason = quarantineCheck.reason;
      }
      solutions.push(newSolution);
    }

    // Update pattern
    const { data: updated, error } = await supabase
      .from('issue_patterns')
      .update({
        occurrence_count: newCount,
        last_seen_sd_id: sd_id,
        proven_solutions: solutions,
        average_resolution_time: `${Math.round(resolution_time_minutes)} minutes`,
        success_rate: this.calculateSuccessRate({ proven_solutions: solutions }) * 100,
        updated_at: new Date().toISOString()
      })
      .eq('pattern_id', pattern_id)
      .select()
      .single();

    if (error) {
      console.error('  ❌ Error updating pattern:', error);
      throw error;
    }

    console.log(`  ✅ Updated pattern ${pattern_id}: ${newCount} total occurrences`);

    // SD-LEO-INFRA-CLASS-LEVEL-PATTERN-001: record SITE DIVERSITY (sd-level site
    // at this seam) and escalate a structural class at >=N distinct sites.
    // FAIL-SOFT by contract — never harms the occurrence write above.
    try {
      const { recordSiteAndMaybeEscalate } = await import('./class-escalation.js');
      await recordSiteAndMaybeEscalate(supabase, updated, { sd_id });
    } catch (escErr) {
      console.warn(`  ⚠ class-escalation skipped (non-fatal): ${escErr.message}`);
    }

    return updated;
  }

  /**
   * Create a draft pattern from feedback cluster or other automated source
   * SD-LEO-INFRA-LEARNING-ARCHITECTURE-001: Feedback→Pattern Bridge
   *
   * @param {Object} data - Pattern data
   * @param {string} data.issue_summary - Description of the issue
   * @param {string} data.category - Category (database, testing, etc.)
   * @param {string} data.severity - Severity level
   * @param {string} data.sd_id - Related SD ID
   * @param {string} data.source - Source type (feedback_cluster, retrospective, manual)
   * @param {string[]} data.source_feedback_ids - Array of feedback UUIDs that contributed
   * @param {number} data.occurrence_count - Number of occurrences in cluster
   * @returns {Object} Created pattern or existing pattern info
   */
  async createDraftPattern(data) {
    const {
      issue_summary,
      category = 'general',
      severity = 'medium',
      sd_id = null,
      source = 'feedback_cluster',
      source_feedback_ids = [],
      occurrence_count = 1
    } = data;

    // Check for similar existing patterns first
    const similar = await this.search(issue_summary, { limit: 1 });
    if (similar.length > 0 && similar[0].similarity > 0.5) {
      console.log(`  ⚠️  Similar pattern exists: ${similar[0].pattern_id}`);
      return {
        exists: true,
        pattern_id: similar[0].pattern_id,
        similarity: similar[0].similarity
      };
    }

    // SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-4a — 'draft' was never a legal status.
    //
    // This is NOT a regression. database/migrations/20260110_learn_status_constraints.sql is the
    // ONLY migration that has ever defined issue_patterns_status_check, and it has always been
    // CHECK (status IN ('active','assigned','resolved','obsolete')). So every call through here
    // raised 23514 and destroyed its lesson, from the day the function was written — dead on
    // arrival rather than broken later. Verified by attempting a real insert with status 'draft'
    // at LEAD, which returned 23514; the probe row was removed.
    //
    // Draft-ness is a LIFECYCLE claim, and the column already has a value for "not yet acted on":
    // 'active'. The two callers (lib/learning/feedback-clusterer.js:200 and :273) want a pattern
    // that exists and can be reviewed, which 'active' gives them. Widening the constraint to admit
    // 'draft' would be the larger change and would need every status consumer audited first.
    const pattern = await this.createPattern({
      issue_summary,
      category,
      severity,
      sd_id,
      solution: null,
      resolution_time_minutes: null,
      status: 'active',
      source,
      source_feedback_ids
    });

    // Update occurrence count to match cluster size
    if (occurrence_count > 1) {
      await supabase
        .from('issue_patterns')
        .update({ occurrence_count })
        .eq('pattern_id', pattern.pattern_id);
    }

    console.log(`  ✨ Created draft pattern: ${pattern.pattern_id} (source: ${source})`);
    return pattern;
  }

  /**
   * Create new pattern
   * LEO Protocol v4.3.2: Added related_sub_agents support
   */
  async createPattern(data) {
    const {
      issue_summary,
      category,
      severity = 'medium',
      sd_id,
      solution = null,
      resolution_time_minutes = null,
      related_sub_agents = null,
      prevention_checklist = [],
      status = 'active',
      source = 'retrospective',
      source_feedback_ids = []
    } = data;

    // SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 / FR-1 — identity, not parsing.
    //
    // WHAT THIS REPLACED, AND WHY THE OBVIOUS FIX IS THE WRONG ONE. The previous code read the
    // maximum pattern_id and incremented it. pattern_id is TEXT, so DESC is LEXICOGRAPHIC: the
    // live maximum is VGAP-V11, which contains no "PAT-" substring at all, so /PAT-(\d+)/ matched
    // nothing, patternNum stayed at its initialiser, and EVERY insert became PAT-001. PAT-001
    // already exists, so every call collided on issue_patterns_pattern_id_key and threw 23505 —
    // the lesson was DESTROYED, not duplicated. The if(match) had no else, so the failure was
    // silent at the point of origin.
    //
    // The tempting repair is to teach the regex about VGAP-. That fixes the wrong layer. A live
    // census of all 1658 rows: bare PAT-nnn is EIGHT of them, 0.5%. PAT-AUTO- (540) and
    // PAT-HF-/PAT-RETRO- (889) are 86% combined, and they use fingerprint schemes DELIBERATELY —
    // three independent places in this tree say a shared numeric sequence is unsafe under
    // concurrent writers, and two completed quick-fixes (QF-20260713-000, QF-20260713-946) bypassed
    // this very generator rather than repairing it. A smarter parser still reads-then-writes, so it
    // still races: two callers reading the same maximum still derive the same id.
    //
    // So identity comes from CONTENT, mirroring lib/rca/rca-orchestrator.js:291. No read, nothing
    // to race, and the same lesson deterministically yields the same id — which turns an accidental
    // collision into an intentional idempotency signal the caller can act on.
    const fingerprint = createHash('sha256')
      .update([category || '', issue_summary || '', sd_id || ''].join(FIELD_SEP))
      .digest('hex')
      .slice(0, 12);
    const pattern_id = `PAT-LES-${fingerprint}`;

    const pattern = {
      pattern_id,
      category,
      issue_summary,
      occurrence_count: 1,
      first_seen_sd_id: sd_id,
      last_seen_sd_id: sd_id,
      severity,
      proven_solutions: solution ? [{
        solution,
        times_applied: 1,
        times_successful: 1,
        success_rate: 100,
        avg_resolution_time_minutes: resolution_time_minutes,
        first_used_sd_id: sd_id
      }] : [],
      prevention_checklist: prevention_checklist || [],
      related_sub_agents: related_sub_agents || [],
      status: status || 'active',
      trend: 'stable',
      source: source || 'retrospective',
      source_feedback_ids: source_feedback_ids || []
    };

    const { data: created, error } = await supabase
      .from('issue_patterns')
      .insert([pattern])
      .select()
      .single();

    if (error) throw error;

    console.log(`  ✨ Created new pattern ${pattern_id}`);
    return created;
  }

  /**
   * Get prevention checklist for a category
   */
  async getPreventionChecklist(category) {
    const { data: patterns } = await supabase
      .from('issue_patterns')
      .select('prevention_checklist')
      .eq('category', category)
      .eq('status', 'active');

    if (!patterns) return [];

    // Aggregate all prevention items
    const allItems = new Set();
    patterns.forEach(p => {
      if (p.prevention_checklist) {
        p.prevention_checklist.forEach(item => allItems.add(item));
      }
    });

    return Array.from(allItems);
  }

  /**
   * Get all active patterns grouped by category
   */
  async getPatternsByCategory() {
    let patterns;
    try {
      patterns = await fetchAllPaginated(() => supabase
        .from('issue_patterns')
        .select('*')
        .eq('status', 'active')
        .order('occurrence_count', { ascending: false })
        .order('id', { ascending: true }));
    } catch {
      return {};
    }

    if (!patterns) return {};

    const byCategory = {};
    patterns.forEach(p => {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p);
    });

    return byCategory;
  }

  /**
   * Get statistics about the knowledge base
   */
  async getStatistics(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    let allPatterns;
    try {
      allPatterns = await fetchAllPaginated(() => supabase
        .from('issue_patterns')
        .select('*')
        .order('id', { ascending: true }));
    } catch {
      allPatterns = [];
    }

    let recentPatterns;
    try {
      recentPatterns = await fetchAllPaginated(() => supabase
        .from('issue_patterns')
        .select('*')
        .gte('updated_at', since.toISOString())
        .order('id', { ascending: true }));
    } catch {
      recentPatterns = [];
    }

    const stats = {
      total_patterns: allPatterns.length || 0,
      active_patterns: allPatterns.filter(p => p.status === 'active').length || 0,
      obsolete_patterns: allPatterns.filter(p => p.status === 'obsolete').length || 0,
      recent_occurrences: recentPatterns.reduce((sum, p) => sum + p.occurrence_count, 0) || 0,
      avg_success_rate: this.calculateAverageSuccessRate(allPatterns),
      by_category: this.groupByCategory(allPatterns),
      by_severity: this.groupBySeverity(allPatterns)
    };

    return stats;
  }

  // Helper methods

  calculateSimilarity(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  calculateSuccessRate(pattern) {
    // QF-20260525-885: Array.isArray guards the .reduce() calls below from throwing
    // when proven_solutions is a non-array jsonb value (the reported crash site).
    if (!Array.isArray(pattern.proven_solutions) || pattern.proven_solutions.length === 0) {
      return 0;
    }

    const totalApplied = pattern.proven_solutions.reduce((sum, s) =>
      sum + (s.times_applied || 0), 0);
    const totalSuccessful = pattern.proven_solutions.reduce((sum, s) =>
      sum + (s.times_successful || 0), 0);

    return totalApplied > 0 ? totalSuccessful / totalApplied : 0;
  }

  calculateRecencyScore(pattern) {
    if (!pattern.updated_at) return 0;

    const daysSince = (Date.now() - new Date(pattern.updated_at).getTime()) /
                      (1000 * 60 * 60 * 24);

    // Exponential decay: recent = 1.0, 30 days = 0.5, 90 days = 0.1
    return Math.exp(-daysSince / 30);
  }

  calculateAverageSuccessRate(patterns) {
    if (patterns.length === 0) return 0;

    const total = patterns.reduce((sum, p) =>
      sum + this.calculateSuccessRate(p), 0);

    return (total / patterns.length) * 100;
  }

  groupByCategory(patterns) {
    const grouped = {};
    patterns.forEach(p => {
      if (!grouped[p.category]) grouped[p.category] = 0;
      grouped[p.category]++;
    });
    return grouped;
  }

  groupBySeverity(patterns) {
    const grouped = {};
    patterns.forEach(p => {
      if (!grouped[p.severity]) grouped[p.severity] = 0;
      grouped[p.severity]++;
    });
    return grouped;
  }
}

export default IssueKnowledgeBase;
