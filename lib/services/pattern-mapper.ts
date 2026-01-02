/**
 * Pattern Mapper Service
 *
 * Maps post-mortem content to failure patterns with confidence scoring.
 * Part of SD-FAILURE-FEEDBACK-001 - Feedback Loop
 */

import type { FailurePattern } from './pattern-scorer';

export interface PatternMatch {
  patternId: string;
  patternName: string;
  category: string;
  confidenceScore: number;
  matchedSignals: string[];
  matchedWhys: number[];
}

export interface PostmortemContent {
  id: string;
  why1?: string;
  why2?: string;
  why3?: string;
  why4?: string;
  why5?: string;
  rootCauseSummary?: string;
}

export interface PatternLink {
  postmortemId: string;
  patternId: string;
  confidenceScore: number;
  matchType: 'manual' | 'auto_suggested' | 'confirmed';
  mapperNotes?: string;
  matchedWhys?: number[];
}

export interface ImprovementProposal {
  sourcePostmortemId: string;
  targetPatternId: string;
  improvementType: 'update_signals' | 'add_prevention' | 'update_mitigation' | 'new_pattern' | 'deprecate';
  title: string;
  description: string;
  proposedChanges?: Record<string, unknown>;
}

/**
 * PatternMapper - Suggest and link patterns from post-mortem content
 */
export class PatternMapper {
  private patterns: FailurePattern[] = [];
  private minConfidence: number;

  constructor(options?: { minConfidence?: number }) {
    this.minConfidence = options?.minConfidence ?? 30;
  }

  /**
   * Load patterns from database
   */
  async loadPatterns(supabase: any): Promise<void> {
    const { data, error } = await supabase
      .from('failure_patterns')
      .select('*')
      .eq('status', 'active');

    if (error) {
      throw new Error(`Failed to load patterns: ${error.message}`);
    }

    this.patterns = data || [];
  }

  /**
   * Suggest matching patterns for a post-mortem
   */
  suggestPatterns(postmortem: PostmortemContent): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const whys = [
      { num: 1, text: postmortem.why1 },
      { num: 2, text: postmortem.why2 },
      { num: 3, text: postmortem.why3 },
      { num: 4, text: postmortem.why4 },
      { num: 5, text: postmortem.why5 },
    ];

    const allText = [
      ...whys.map(w => w.text).filter(Boolean),
      postmortem.rootCauseSummary,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    for (const pattern of this.patterns) {
      const matchedSignals: string[] = [];
      const matchedWhys: number[] = [];

      // Check each detection signal
      for (const signal of pattern.detection_signals || []) {
        const signalLower = signal.toLowerCase();
        const signalWords = signalLower.split(/\s+/);

        // Check if signal keywords appear in text
        const signalMatches = signalWords.filter(
          word => word.length > 3 && allText.includes(word)
        );

        if (signalMatches.length >= Math.min(2, signalWords.length)) {
          matchedSignals.push(signal);

          // Determine which Whys matched
          for (const why of whys) {
            if (why.text && signalWords.some(word => why.text!.toLowerCase().includes(word))) {
              if (!matchedWhys.includes(why.num)) {
                matchedWhys.push(why.num);
              }
            }
          }
        }
      }

      if (matchedSignals.length === 0) continue;

      // Calculate confidence score
      const totalSignals = pattern.detection_signals?.length || 1;
      const signalRatio = matchedSignals.length / totalSignals;
      const whyBonus = matchedWhys.length * 5; // Bonus for multiple Why matches
      const confidenceScore = Math.min(100, Math.round(signalRatio * 80 + whyBonus));

      if (confidenceScore >= this.minConfidence) {
        matches.push({
          patternId: pattern.pattern_id,
          patternName: pattern.pattern_name,
          category: pattern.category,
          confidenceScore,
          matchedSignals,
          matchedWhys: matchedWhys.sort((a, b) => a - b),
        });
      }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Create pattern link in database
   */
  async createLink(supabase: any, link: PatternLink): Promise<string> {
    const { data, error } = await supabase
      .from('postmortem_pattern_links')
      .insert({
        postmortem_id: link.postmortemId,
        pattern_id: link.patternId,
        confidence_score: link.confidenceScore,
        match_type: link.matchType,
        mapper_notes: link.mapperNotes,
        matched_whys: link.matchedWhys,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create link: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Create improvement proposal in database
   */
  async proposeImprovement(supabase: any, proposal: ImprovementProposal): Promise<string> {
    const { data, error } = await supabase
      .from('pattern_improvements')
      .insert({
        source_postmortem_id: proposal.sourcePostmortemId,
        target_pattern_id: proposal.targetPatternId,
        improvement_type: proposal.improvementType,
        title: proposal.title,
        description: proposal.description,
        proposed_changes: proposal.proposedChanges || {},
        status: 'proposed',
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create proposal: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Get existing links for a post-mortem
   */
  async getLinksForPostmortem(supabase: any, postmortemId: string): Promise<PatternLink[]> {
    const { data, error } = await supabase
      .from('postmortem_pattern_links')
      .select('*')
      .eq('postmortem_id', postmortemId);

    if (error) {
      throw new Error(`Failed to get links: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      postmortemId: row.postmortem_id,
      patternId: row.pattern_id,
      confidenceScore: row.confidence_score,
      matchType: row.match_type,
      mapperNotes: row.mapper_notes,
      matchedWhys: row.matched_whys,
    }));
  }

  /**
   * Get pending improvements for a pattern
   */
  async getPendingImprovements(supabase: any, patternId: string): Promise<ImprovementProposal[]> {
    const { data, error } = await supabase
      .from('pattern_improvements')
      .select('*')
      .eq('target_pattern_id', patternId)
      .in('status', ['proposed', 'under_review', 'approved']);

    if (error) {
      throw new Error(`Failed to get improvements: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      sourcePostmortemId: row.source_postmortem_id,
      targetPatternId: row.target_pattern_id,
      improvementType: row.improvement_type,
      title: row.title,
      description: row.description,
      proposedChanges: row.proposed_changes,
    }));
  }
}

export default PatternMapper;
