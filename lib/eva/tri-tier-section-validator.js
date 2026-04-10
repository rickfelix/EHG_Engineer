/**
 * B1 (SD-LEO-INFRA-LEO-UPSTREAM-DECISION-001): Always / Ask First / Never tri-tier validator
 *
 * Validates that vision documents include the three new boundary sections that
 * encode orchestrator constraints in machine-actionable form:
 *
 *   ## Always       — orchestrator must do X (executes without chairman prompt)
 *   ## Ask First    — orchestrator must prompt chairman before Y
 *   ## Never        — orchestrator must never Z (hard constraint)
 *
 * This is the highest-leverage validator in the SD because it's the only one
 * that REDUCES chairman interrupt count. Always-tier decisions execute
 * autonomously; only Ask-First decisions actually interrupt the chairman.
 *
 * Returns { issues: Array<{section, reason}> } — empty array if all 3 sections
 * are present.
 *
 * Backward compatibility: B1 validator runs only on NEW upserts. Existing
 * vision documents are not re-validated on read; they continue to use the
 * legacy "Out of Scope" pattern until they are next upserted (at which point
 * the chairman has the opportunity to add the new sections).
 *
 * Ships in WARNING-ONLY mode initially. Issues are printed by the caller and
 * (in a future version) persisted to eva_vision_documents.quality_issues for
 * telemetry. Promotion to blocking requires chairman acceptance of the mental
 * model (Vision SC #7) and a low false-positive rate over a 2-week window.
 */
export function validateTriTierBoundaries(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') return { issues: [] };

  // Match level-2 (or higher) headings — case-insensitive, allow trailing spaces.
  // \s+ between "Ask" and "First" enforces single-space (matches `Ask First`,
  // not `Ask  First`); use \s+ rather than literal space so tabs also work.
  const alwaysPattern = /^#{2,6}\s*Always\s*$/im;
  const askFirstPattern = /^#{2,6}\s*Ask First\s*$/im;
  const neverPattern = /^#{2,6}\s*Never\s*$/im;

  const issues = [];

  if (!alwaysPattern.test(rawContent)) {
    issues.push({
      section: 'Always',
      reason: 'Missing "## Always" section. Vision documents created after the B1 ship date should encode autonomous-execution constraints in this section so orchestrators know what to do without prompting the chairman. Example: "Always run database-agent for schema changes". See docs/reference/always-ask-first-never.md for the mental model.'
    });
  }

  if (!askFirstPattern.test(rawContent)) {
    issues.push({
      section: 'Ask First',
      reason: 'Missing "## Ask First" section. Vision documents should encode chairman-approval-required decisions in this section. Example: "Ask First before introducing a new dependency". This is what makes B1 worth shipping — it shrinks the set of decisions that interrupt the chairman.'
    });
  }

  if (!neverPattern.test(rawContent)) {
    issues.push({
      section: 'Never',
      reason: 'Missing "## Never" section. Vision documents should encode hard negative constraints in this section. Example: "Never modify the auth tables without a dedicated SD". This is the safety net that prevents orchestrators from doing irreversible damage.'
    });
  }

  return { issues };
}

/**
 * Helper for vision-command.mjs to print B1 issues with consistent formatting.
 */
export function formatTriTierWarnings(issues) {
  if (!issues || issues.length === 0) return null;
  const lines = [
    `\n   ⚠️  B1: Vision document missing ${issues.length} of 3 tri-tier boundary sections (warning-only mode):`
  ];
  for (const issue of issues) {
    lines.push(`      • ## ${issue.section}`);
    lines.push(`        ${issue.reason.slice(0, 240)}`);
  }
  lines.push(`      (B1 is in warning-only mode. Existing vision documents are unaffected — only new upserts are validated.)`);
  return lines.join('\n');
}
