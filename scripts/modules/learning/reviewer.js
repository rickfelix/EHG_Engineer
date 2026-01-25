/**
 * LearningReviewer (Devil's Advocate)
 *
 * Generates counter-arguments for each surfaced learning item.
 * DA mode is always shown (no skip option per triangulation consensus).
 *
 * Counter-arguments challenge:
 * - Assumptions about the problem
 * - Scope of the proposed solution
 * - Timing of implementation
 * - Necessity of the change
 */

/**
 * Generate Devil's Advocate counter-argument for a pattern
 */
function generatePatternDA(pattern, intelligence = {}) {
  const challenges = [];
  const suggestions = [];

  // Challenge based on recency (new intelligence)
  if (pattern.recency_status === 'stale') {
    challenges.push(`Pattern is stale (${Math.round(pattern.days_since_update)} days old) - may no longer be relevant.`);
    suggestions.push('Consider resolving this pattern if no longer occurring.');
  } else if (pattern.recency_status === 'aging') {
    challenges.push(`Pattern is aging (${Math.round(pattern.days_since_update)} days) - confidence reduced.`);
  }

  // Challenge based on occurrence count
  if (pattern.occurrence_count < 3) {
    challenges.push(`Only ${pattern.occurrence_count} occurrences recorded - is this truly a pattern or coincidence?`);
  }

  // Challenge based on severity
  if (pattern.severity === 'LOW' || pattern.severity === 'low') {
    challenges.push('Low severity - prioritizing this may distract from higher-impact issues.');
  }

  // Challenge proven solutions
  if (pattern.proven_solutions?.length > 0) {
    const solution = pattern.proven_solutions[0];
    if (solution.success_rate && solution.success_rate < 80) {
      challenges.push(`Proven solution has only ${solution.success_rate}% success rate - may not be reliable.`);
    }
  } else {
    challenges.push('No proven solutions recorded - implementing may be speculative.');
  }

  // Challenge trend
  if (pattern.trend === 'decreasing') {
    challenges.push('Trend is decreasing - issue may be resolving naturally without intervention.');
    suggestions.push('Consider resolving this pattern.');
  }

  // Refactoring-specific challenges (PAT-REF-* patterns)
  if (pattern.category === 'refactoring' || pattern.pattern_id?.startsWith('PAT-REF')) {
    // Challenge timing
    challenges.push('Refactoring is advisory - consider if current feature velocity justifies pausing for cleanup.');

    // Challenge scope
    if (pattern.pattern_id === 'PAT-REF-001') {
      // Large file detection
      challenges.push('Large files may be intentional (e.g., generated code, comprehensive test suites) - validate file purpose.');
      suggestions.push('Check if file is generated, a test fixture, or has unique justification.');
    } else if (pattern.pattern_id === 'PAT-REF-002') {
      // High cyclomatic complexity
      challenges.push('High complexity may be inherent to domain logic (state machines, parsers) - ensure refactoring preserves correctness.');
      suggestions.push('Run REGRESSION sub-agent before and after any complexity reduction.');
    } else if (pattern.pattern_id === 'PAT-REF-003') {
      // RISK technical_complexity > 7
      challenges.push('RISK score is one signal - correlate with actual maintenance burden before prioritizing.');
      suggestions.push('Review recent bug/PR history in affected files.');
    } else if (pattern.pattern_id === 'PAT-REF-004') {
      // DRY violation
      challenges.push('Some duplication is acceptable - premature abstraction can reduce clarity. "Rule of three" applies.');
    } else if (pattern.pattern_id === 'PAT-REF-005') {
      // Long function
      challenges.push('Function length alone may not indicate problems - cohesion and single responsibility matter more.');
      suggestions.push('Check if function has clear single purpose despite length.');
    }
  }

  // Check for similar patterns (duplicate detection)
  const similarTo = intelligence.similar_patterns?.[pattern.id];
  if (similarTo && similarTo.length > 0) {
    const topSimilar = similarTo[0];
    challenges.push(`May be duplicate of ${topSimilar.pattern_id} (${topSimilar.similarity}% similar).`);
    suggestions.push(`Review ${topSimilar.pattern_id} for consolidation.`);
  }

  // Default challenge
  if (challenges.length === 0) {
    challenges.push('Consider: Is addressing this pattern the highest-value use of time right now?');
  }

  return {
    ...pattern,
    da_counter_argument: challenges[0],
    da_all_challenges: challenges,
    da_suggestions: suggestions.length > 0 ? suggestions : null
  };
}

/**
 * Generate Devil's Advocate counter-argument for a lesson
 */
function generateLessonDA(lesson) {
  const challenges = [];

  // Challenge based on confidence
  if (lesson.confidence < 70) {
    challenges.push(`Confidence score of ${lesson.confidence}% - lesson may not be broadly applicable.`);
  }

  // Challenge based on recency
  const age = Date.now() - new Date(lesson.created_at).getTime();
  const daysOld = Math.floor(age / (1000 * 60 * 60 * 24));
  if (daysOld > 30) {
    challenges.push(`Lesson is ${daysOld} days old - context may have changed since then.`);
  }

  // Challenge based on content length
  if (lesson.content.length < 50) {
    challenges.push('Brief lesson description - may lack sufficient context for action.');
  }

  // Default challenge
  if (challenges.length === 0) {
    challenges.push('Consider: Is this lesson specific enough to drive concrete changes?');
  }

  return {
    ...lesson,
    da_counter_argument: challenges[0],
    da_all_challenges: challenges
  };
}

/**
 * Generate Devil's Advocate counter-argument for an improvement
 */
function generateImprovementDA(improvement) {
  const challenges = [];

  // Challenge based on evidence count
  if (improvement.evidence_count < 2) {
    challenges.push(`Only ${improvement.evidence_count} evidence instance(s) - may be premature to make this change.`);
  }

  // Challenge based on improvement type
  if (improvement.improvement_type === 'VALIDATION_RULE') {
    challenges.push('New validation rule may add friction to existing workflows. Consider false positive impact.');
  }
  if (improvement.improvement_type === 'PROTOCOL_SECTION') {
    challenges.push('Protocol changes require CLAUDE.md regeneration - verify timing is appropriate.');
  }

  // Challenge based on target
  if (improvement.target_table === 'leo_sub_agents') {
    challenges.push('Sub-agent changes affect multiple workflows - ensure backward compatibility.');
  }

  // Challenge based on operation
  if (improvement.target_operation === 'DELETE') {
    challenges.push('Deletion operation - ensure no downstream dependencies exist.');
  }

  // Default challenge
  if (challenges.length === 0) {
    challenges.push('Consider: What could go wrong if this improvement is applied incorrectly?');
  }

  return {
    ...improvement,
    da_counter_argument: challenges[0],
    da_all_challenges: challenges
  };
}

/**
 * Review all context items and add DA counter-arguments
 */
export function reviewContext(context) {
  const intelligence = context.intelligence || {};

  const reviewed = {
    patterns: context.patterns.map(p => generatePatternDA(p, intelligence)),
    lessons: context.lessons.map(generateLessonDA),
    improvements: context.improvements.map(generateImprovementDA),
    intelligence: intelligence, // Pass through for display
    summary: {
      ...context.summary,
      reviewed_at: new Date().toISOString(),
      da_mode: 'always_show', // Per triangulation consensus
      resolution_candidates: intelligence.resolution_candidates?.length || 0
    }
  };

  return reviewed;
}

/**
 * Format reviewed context for display with DA
 */
export function formatReviewedContextForDisplay(reviewed) {
  const lines = [];

  // Show intelligence summary if available
  const intel = reviewed.intelligence || {};
  if (intel.resolution_candidates?.length > 0 || intel.stale_count > 0) {
    lines.push('\n## 🧠 Intelligence Summary');
    if (intel.stale_count > 0) {
      lines.push(`  - ${intel.stale_count} stale pattern(s) (60+ days) - consider resolving`);
    }
    if (intel.aging_count > 0) {
      lines.push(`  - ${intel.aging_count} aging pattern(s) (30+ days) - confidence reduced`);
    }
    if (intel.resolution_candidates?.length > 0) {
      lines.push(`  - ${intel.resolution_candidates.length} pattern(s) may be ready for resolution: ${intel.resolution_candidates.join(', ')}`);
    }
  }

  lines.push('\n## Patterns (with Devil\'s Advocate)');
  for (const p of reviewed.patterns) {
    lines.push(`\n**[${p.id}]** ${p.content}`);
    lines.push(`  - Category: ${p.category} | Severity: ${p.severity} | Occurrences: ${p.occurrence_count}`);

    // Show confidence with reason if decayed
    if (p.confidence_reason) {
      lines.push(`  - Confidence: ${p.confidence}% (${p.confidence_reason})`);
    } else {
      lines.push(`  - Confidence: ${p.confidence}%`);
    }

    lines.push(`  - **🔴 DA:** ${p.da_counter_argument}`);

    // Show suggestions if any
    if (p.da_suggestions && p.da_suggestions.length > 0) {
      lines.push(`  - **💡 Suggestion:** ${p.da_suggestions[0]}`);
    }
  }

  lines.push('\n## Lessons (with Devil\'s Advocate)');
  for (const l of reviewed.lessons) {
    lines.push(`\n**[${l.id}]** ${l.content}`);
    lines.push(`  - Source SD: ${l.sd_id || 'N/A'} | Confidence: ${l.confidence}%`);
    lines.push(`  - **🔴 DA:** ${l.da_counter_argument}`);
  }

  lines.push('\n## Improvements (with Devil\'s Advocate)');
  for (const i of reviewed.improvements) {
    lines.push(`\n**[${i.id}]** ${i.title}`);
    lines.push(`  - Type: ${i.improvement_type} | Evidence: ${i.evidence_count}`);
    lines.push(`  - ${i.content}`);
    lines.push(`  - **🔴 DA:** ${i.da_counter_argument}`);
  }

  return lines.join('\n');
}

export default { reviewContext, formatReviewedContextForDisplay };
