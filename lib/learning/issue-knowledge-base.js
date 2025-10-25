#!/usr/bin/env node
/**
 * Issue Knowledge Base
 * Persistent, searchable index of all known issues and their solutions
 * Provides fast lookup and retrieval of historical problem-solving data
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
      // Build query
      let queryBuilder = supabase
        .from('issue_patterns')
        .select('*');

      if (!includeObsolete) {
        queryBuilder = queryBuilder.eq('status', 'active');
      }

      if (category) {
        queryBuilder = queryBuilder.eq('category', category);
      }

      const { data: patterns, error } = await queryBuilder;

      if (error) throw error;
      if (!patterns || patterns.length === 0) {
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

    if (!pattern || !pattern.proven_solutions || pattern.proven_solutions.length === 0) {
      return null;
    }

    // Return highest success rate solution
    const solutions = pattern.proven_solutions;
    solutions.sort((a, b) => (b.success_rate || 0) - (a.success_rate || 0));

    return {
      pattern_id: pattern.pattern_id,
      category: pattern.category,
      issue: pattern.issue_summary,
      recommended_solution: solutions[0],
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
      found_via_search = false
    } = data;

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
    let solutions = pattern.proven_solutions || [];
    const existingSolution = solutions.find(s =>
      s.solution.toLowerCase() === solution_applied.toLowerCase()
    );

    if (existingSolution) {
      // Update existing solution stats
      existingSolution.times_applied = (existingSolution.times_applied || 0) + 1;
      if (was_successful) {
        existingSolution.times_successful = (existingSolution.times_successful || 0) + 1;
      }
      existingSolution.success_rate =
        (existingSolution.times_successful / existingSolution.times_applied) * 100;

      // Update average resolution time
      const totalTime = (existingSolution.avg_resolution_time_minutes || 0) *
                        ((existingSolution.times_applied || 1) - 1);
      existingSolution.avg_resolution_time_minutes =
        (totalTime + resolution_time_minutes) / existingSolution.times_applied;
    } else {
      // Add new solution
      solutions.push({
        solution: solution_applied,
        times_applied: 1,
        times_successful: was_successful ? 1 : 0,
        success_rate: was_successful ? 100 : 0,
        avg_resolution_time_minutes: resolution_time_minutes,
        first_used_sd_id: sd_id,
        found_via_search
      });
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
    return updated;
  }

  /**
   * Create new pattern
   */
  async createPattern(data) {
    const {
      issue_summary,
      category,
      severity = 'medium',
      sd_id,
      solution = null,
      resolution_time_minutes = null
    } = data;

    // Generate pattern ID
    const { data: lastPattern } = await supabase
      .from('issue_patterns')
      .select('pattern_id')
      .order('pattern_id', { ascending: false })
      .limit(1)
      .single();

    let patternNum = 1;
    if (lastPattern) {
      const match = lastPattern.pattern_id.match(/PAT-(\d+)/);
      if (match) {
        patternNum = parseInt(match[1]) + 1;
      }
    }

    const pattern_id = `PAT-${String(patternNum).padStart(3, '0')}`;

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
      status: 'active',
      trend: 'stable'
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
    const { data: patterns } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false });

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

    const { data: allPatterns } = await supabase
      .from('issue_patterns')
      .select('*');

    const { data: recentPatterns } = await supabase
      .from('issue_patterns')
      .select('*')
      .gte('updated_at', since.toISOString());

    const stats = {
      total_patterns: allPatterns?.length || 0,
      active_patterns: allPatterns?.filter(p => p.status === 'active').length || 0,
      obsolete_patterns: allPatterns?.filter(p => p.status === 'obsolete').length || 0,
      recent_occurrences: recentPatterns?.reduce((sum, p) => sum + p.occurrence_count, 0) || 0,
      avg_success_rate: this.calculateAverageSuccessRate(allPatterns || []),
      by_category: this.groupByCategory(allPatterns || []),
      by_severity: this.groupBySeverity(allPatterns || [])
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
    if (!pattern.proven_solutions || pattern.proven_solutions.length === 0) {
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
