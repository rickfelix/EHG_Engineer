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
function generatePatternDA(pattern) {
  const challenges = [];

  // Challenge based on occurrence count
  if (pattern.occurrence_count < 3) {
    challenges.push(`Only ${pattern.occurrence_count} occurrences recorded - is this truly a pattern or coincidence?`);
  }

  // Challenge based on severity
  if (pattern.severity === 'LOW') {
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
  }

  // Default challenge
  if (challenges.length === 0) {
    challenges.push('Consider: Is addressing this pattern the highest-value use of time right now?');
  }

  return {
    ...pattern,
    da_counter_argument: challenges[0],
    da_all_challenges: challenges
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
  const reviewed = {
    patterns: context.patterns.map(generatePatternDA),
    lessons: context.lessons.map(generateLessonDA),
    improvements: context.improvements.map(generateImprovementDA),
    summary: {
      ...context.summary,
      reviewed_at: new Date().toISOString(),
      da_mode: 'always_show' // Per triangulation consensus
    }
  };

  return reviewed;
}

/**
 * Format reviewed context for display with DA
 */
export function formatReviewedContextForDisplay(reviewed) {
  const lines = [];

  lines.push('\n## Patterns (with Devil\'s Advocate)');
  for (const p of reviewed.patterns) {
    lines.push(`\n**[${p.id}]** ${p.content}`);
    lines.push(`  - Category: ${p.category} | Severity: ${p.severity} | Occurrences: ${p.occurrence_count}`);
    lines.push(`  - Confidence: ${p.confidence}%`);
    lines.push(`  - **🔴 DA:** ${p.da_counter_argument}`);
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
