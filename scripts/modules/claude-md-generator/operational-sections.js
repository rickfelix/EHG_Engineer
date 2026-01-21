/**
 * Operational Intelligence Section Generators for CLAUDE.md
 * Handles hot patterns, lessons, gate health, proposals, and directives
 */

/**
 * Generate Hot Issue Patterns section for CLAUDE_CORE.md
 * @param {Array} patterns - List of hot patterns
 * @returns {string} Formatted markdown
 */
function generateHotPatternsSection(patterns) {
  if (!patterns || patterns.length === 0) {
    return '';
  }

  let section = `## Hot Issue Patterns (Auto-Updated)

**CRITICAL**: These are active patterns detected from retrospectives. Review before starting work.

| Pattern ID | Category | Severity | Count | Trend | Top Solution |
|------------|----------|----------|-------|-------|--------------|
`;

  patterns.forEach(p => {
    const topSolution = p.proven_solutions && p.proven_solutions.length > 0
      ? (p.proven_solutions[0].solution || p.proven_solutions[0].method || 'See details').substring(0, 40)
      : 'N/A';
    const trendIcon = p.trend === 'increasing' ? '[UP]' : p.trend === 'decreasing' ? '[DOWN]' : '[STABLE]';
    const severityIcon = p.severity === 'critical' ? '[CRIT]' : p.severity === 'high' ? '[HIGH]' : p.severity === 'medium' ? '[MED]' : '[LOW]';

    section += `| ${p.pattern_id} | ${p.category} | ${severityIcon} ${p.severity} | ${p.occurrence_count} | ${trendIcon} | ${topSolution} |\n`;
  });

  section += `
### Prevention Checklists

`;

  const byCategory = {};
  patterns.forEach(p => {
    if (p.prevention_checklist && p.prevention_checklist.length > 0) {
      const cat = p.category || 'general';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(...p.prevention_checklist.slice(0, 3));
    }
  });

  for (const [category, items] of Object.entries(byCategory)) {
    section += `**${category}**:\n`;
    const uniqueItems = [...new Set(items)].slice(0, 3);
    uniqueItems.forEach(item => {
      section += `- [ ] ${item}\n`;
    });
    section += '\n';
  }

  section += `
*Patterns auto-updated from \`issue_patterns\` table. Use \`npm run pattern:resolve PAT-XXX\` to mark resolved.*
`;

  return section;
}

/**
 * Generate Recent Lessons section for CLAUDE_CORE.md
 * @param {Array} retrospectives - List of retrospectives
 * @returns {string} Formatted markdown
 */
function generateRecentLessonsSection(retrospectives) {
  if (!retrospectives || retrospectives.length === 0) {
    return '';
  }

  let section = `## Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

`;

  retrospectives.forEach((r, idx) => {
    const date = r.conducted_date ? new Date(r.conducted_date).toLocaleDateString() : 'N/A';
    const category = r.learning_category || 'GENERAL';
    const qualityBadge = r.quality_score >= 80 ? '[QUALITY]' : '';

    section += `### ${idx + 1}. ${r.title || r.sd_id || 'Untitled'} ${qualityBadge}\n`;
    section += `**Category**: ${category} | **Date**: ${date} | **Score**: ${r.quality_score || 'N/A'}\n\n`;

    if (r.what_needs_improvement && Array.isArray(r.what_needs_improvement)) {
      const improvements = r.what_needs_improvement
        .filter(item => {
          if (typeof item === 'object' && item.is_boilerplate === true) return false;
          return true;
        })
        .slice(0, 2);
      if (improvements.length > 0) {
        section += '**Key Improvements**:\n';
        improvements.forEach(item => {
          let text;
          if (typeof item === 'string') {
            text = item;
          } else if (item.improvement) {
            text = item.improvement;
          } else if (item.description) {
            text = item.description;
          } else if (item.item) {
            text = item.item;
          } else {
            text = JSON.stringify(item);
          }
          section += `- ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}\n`;
        });
        section += '\n';
      }
    }

    if (r.action_items && Array.isArray(r.action_items)) {
      const actions = r.action_items
        .filter(item => {
          if (typeof item === 'object' && item.is_boilerplate === true) return false;
          return true;
        })
        .slice(0, 2);
      if (actions.length > 0) {
        section += '**Action Items**:\n';
        actions.forEach(item => {
          let text;
          if (typeof item === 'string') {
            text = item;
          } else if (item.text) {
            text = item.text;
          } else if (item.action) {
            text = item.action;
          } else if (item.description) {
            text = item.description;
          } else {
            text = Object.values(item).find(v => typeof v === 'string') || 'See details';
          }
          section += `- [ ] ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}\n`;
        });
        section += '\n';
      }
    }
  });

  section += `
*Lessons auto-generated from \`retrospectives\` table. Query for full details.*
`;

  return section;
}

/**
 * Generate Gate Health section for CLAUDE_CORE.md
 * @param {Array} gateHealth - List of gate health metrics
 * @returns {string} Formatted markdown
 */
function generateGateHealthSection(gateHealth) {
  if (!gateHealth || gateHealth.length === 0) {
    return '';
  }

  let section = `## Gate Health Monitor (Auto-Updated)

**ATTENTION**: These gates are below the 80% pass rate threshold and may need remediation.

| Gate | Pass Rate | Attempts | Failures | Status |
|------|-----------|----------|----------|--------|
`;

  gateHealth.forEach(g => {
    const statusIcon = g.pass_rate < 50 ? '[CRIT]' : g.pass_rate < 70 ? '[WARN]' : '[MON]';
    const status = g.pass_rate < 50 ? 'Critical' : g.pass_rate < 70 ? 'Warning' : 'Monitor';

    section += `| Gate ${g.gate} | ${g.pass_rate}% | ${g.total_attempts} | ${g.failures} | ${statusIcon} ${status} |\n`;
  });

  section += `
### Remediation Actions

When gates consistently fail:
1. Run \`npm run gate:health\` for detailed analysis
2. Review validation rules in \`leo_validation_rules\` table
3. Check if rules are too strict or outdated
4. Create remediation SD if pass rate < 70% for 2+ weeks

*Gate health auto-updated from \`v_gate_health_metrics\`. Run \`npm run gate:health\` for details.*
`;

  return section;
}

/**
 * Generate Proactive SD Proposals section for CLAUDE_CORE.md
 * @param {Array} proposals - List of pending proposals
 * @returns {string} Formatted markdown
 */
function generateProposalsSection(proposals) {
  if (!proposals || proposals.length === 0) {
    return '';
  }

  let section = `## Proactive SD Proposals (LEO v4.4)

**ACTION REQUIRED**: These are AI-generated proposals awaiting chairman approval.

`;

  proposals.forEach((p, idx) => {
    const urgencyIcon = p.urgency_level === 'critical' ? '[CRIT]' :
                        p.urgency_level === 'medium' ? '[MED]' : '[LOW]';
    const triggerLabel = {
      'dependency_update': 'Dependency',
      'retrospective_pattern': 'Pattern',
      'code_health': 'Code Health'
    }[p.trigger_type] || p.trigger_type;
    const confidence = (p.confidence_score * 100).toFixed(0);

    section += `### ${idx + 1}. ${urgencyIcon} ${p.title}
**Trigger**: ${triggerLabel} | **Confidence**: ${confidence}% | **ID**: \`${p.id.substring(0, 8)}\`

${p.description.substring(0, 200)}${p.description.length > 200 ? '...' : ''}

`;
  });

  section += `### Quick Actions

\`\`\`bash
# Approve proposal (creates draft SD):
npm run proposal:approve <proposal-id>

# Dismiss proposal:
npm run proposal:dismiss <proposal-id> <reason>
# Reasons: not_relevant, wrong_timing, duplicate, too_small, too_large, already_fixed, other

# View all pending:
npm run proposal:list
\`\`\`

*Proposals auto-generated by observer agents. Run \`npm run proposal:list\` for full details.*
`;

  return section;
}

/**
 * Generate Autonomous Continuation Directives section for phase files
 * @param {Array} directives - All active directives
 * @param {string} phase - The phase to filter for (LEAD, PLAN, EXEC)
 * @returns {string} Formatted markdown
 */
function generateAutonomousDirectivesSection(directives, phase) {
  if (!directives || directives.length === 0) {
    return '';
  }

  const phaseDirectives = directives.filter(d =>
    d.applies_to_phases && d.applies_to_phases.includes(phase)
  );

  if (phaseDirectives.length === 0) {
    return '';
  }

  const alwaysDirectives = phaseDirectives.filter(d => d.enforcement_point === 'ALWAYS');
  const onFailureDirectives = phaseDirectives.filter(d => d.enforcement_point === 'ON_FAILURE');
  const handoffDirectives = phaseDirectives.filter(d => d.enforcement_point === 'HANDOFF_START');

  let section = `## Autonomous Continuation Directives

**CRITICAL**: These directives guide autonomous agent behavior during ${phase} phase execution.

`;

  if (alwaysDirectives.length > 0) {
    section += `### Core Directives (Always Apply)

`;
    alwaysDirectives.forEach((d, idx) => {
      const blockingBadge = d.is_blocking ? ' **[BLOCKING]**' : '';
      section += `**${idx + 1}. ${d.title}**${blockingBadge}
${d.content}

`;
    });
  }

  if (handoffDirectives.length > 0) {
    section += `### Handoff Directives (Apply at Phase Start)

`;
    handoffDirectives.forEach((d, idx) => {
      const blockingBadge = d.is_blocking ? ' **[BLOCKING]**' : '';
      section += `**${idx + 1}. ${d.title}**${blockingBadge}
${d.content}

`;
    });
  }

  if (onFailureDirectives.length > 0) {
    section += `### Conditional Directives (Apply When Issues Occur)

**Trigger**: When encountering errors, blockers, or failures during execution.

`;
    onFailureDirectives.forEach((d, idx) => {
      const blockingBadge = d.is_blocking ? ' **[BLOCKING]**' : '';
      section += `**${idx + 1}. ${d.title}**${blockingBadge}
${d.content}

`;
    });
  }

  section += `---

*Directives from \`leo_autonomous_directives\` table (SD-LEO-CONTINUITY-001)*
`;

  return section;
}

export {
  generateHotPatternsSection,
  generateRecentLessonsSection,
  generateGateHealthSection,
  generateProposalsSection,
  generateAutonomousDirectivesSection
};
