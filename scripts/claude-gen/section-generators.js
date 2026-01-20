/**
 * Section generators for CLAUDE.md files
 * Generates markdown sections from database data
 *
 * Extracted from CLAUDEMDGeneratorV3 class in generate-claude-md-from-db.js
 * Part of SD-LEO-REFACTOR-QUEUE-001
 */

/**
 * Helper to safely stringify JSONB values
 */
function safeJson(val, fallback = 'N/A') {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

/**
 * Generate schema constraints section for EXEC phase
 */
export function generateSchemaConstraintsSection(constraints) {
  if (!constraints || constraints.length === 0) {
    return '';
  }

  let section = `## Database Schema Constraints Reference

**CRITICAL**: These constraints are enforced by the database. Agents MUST use valid values to avoid insert failures.

`;

  // Group by table
  const byTable = {};
  constraints.forEach(c => {
    if (!byTable[c.table_name]) byTable[c.table_name] = [];
    byTable[c.table_name].push(c);
  });

  for (const [table, cols] of Object.entries(byTable)) {
    section += `### ${table}\n\n`;
    section += '| Column | Valid Values | Hint |\n';
    section += '|--------|--------------|------|\n';

    cols.forEach(c => {
      const values = c.valid_values ? JSON.parse(JSON.stringify(c.valid_values)).join(', ') : 'N/A';
      section += `| \`${c.column_name}\` | ${values} | ${c.remediation_hint || ''} |\n`;
    });

    section += '\n';
  }

  return section;
}

/**
 * Generate process scripts section for EXEC phase
 */
export function generateProcessScriptsSection(scripts) {
  if (!scripts || scripts.length === 0) {
    return '';
  }

  let section = `## LEO Process Scripts Reference

**Usage**: All scripts use positional arguments unless noted otherwise.

`;

  // Group by category
  const byCategory = {};
  scripts.forEach(s => {
    const cat = s.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(s);
  });

  for (const [category, categoryScripts] of Object.entries(byCategory)) {
    section += `### ${category.charAt(0).toUpperCase() + category.slice(1)} Scripts\n\n`;

    categoryScripts.forEach(s => {
      section += `#### ${s.script_name}\n`;
      section += `${s.description}\n\n`;
      section += `**Usage**: \`${s.usage_pattern}\`\n\n`;

      if (s.examples && s.examples.length > 0) {
        section += '**Examples**:\n';
        s.examples.forEach(ex => {
          section += `- \`${ex.command}\`\n`;
        });
        section += '\n';
      }

      if (s.common_errors && s.common_errors.length > 0) {
        section += '**Common Errors**:\n';
        s.common_errors.forEach(err => {
          section += `- Pattern: \`${err.error_pattern}\` → Fix: ${err.fix}\n`;
        });
        section += '\n';
      }
    });
  }

  return section;
}

/**
 * Generate Hot Issue Patterns section for CLAUDE_CORE.md
 */
export function generateHotPatternsSection(patterns) {
  if (!patterns || patterns.length === 0) {
    return '';
  }

  let section = `## 🔥 Hot Issue Patterns (Auto-Updated)

**CRITICAL**: These are active patterns detected from retrospectives. Review before starting work.

| Pattern ID | Category | Severity | Count | Trend | Top Solution |
|------------|----------|----------|-------|-------|--------------|
`;

  patterns.forEach(p => {
    const topSolution = p.proven_solutions && p.proven_solutions.length > 0
      ? (p.proven_solutions[0].solution || p.proven_solutions[0].method || 'See details').substring(0, 40)
      : 'N/A';
    const trendIcon = p.trend === 'increasing' ? '📈' : p.trend === 'decreasing' ? '📉' : '➡️';
    const severityIcon = p.severity === 'critical' ? '🔴' : p.severity === 'high' ? '🟠' : p.severity === 'medium' ? '🟡' : '🟢';

    section += `| ${p.pattern_id} | ${p.category} | ${severityIcon} ${p.severity} | ${p.occurrence_count} | ${trendIcon} | ${topSolution} |\n`;
  });

  section += `
### Prevention Checklists

`;

  // Group patterns by category and show prevention checklists
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
 */
export function generateRecentLessonsSection(retrospectives) {
  if (!retrospectives || retrospectives.length === 0) {
    return '';
  }

  let section = `## 📝 Recent Lessons (Last 30 Days)

**From Published Retrospectives** - Apply these learnings proactively.

`;

  retrospectives.forEach((r, idx) => {
    const date = r.conducted_date ? new Date(r.conducted_date).toLocaleDateString() : 'N/A';
    const category = r.learning_category || 'GENERAL';
    const qualityBadge = r.quality_score >= 80 ? '⭐' : '';

    section += `### ${idx + 1}. ${r.title || r.sd_id || 'Untitled'} ${qualityBadge}\n`;
    section += `**Category**: ${category} | **Date**: ${date} | **Score**: ${r.quality_score || 'N/A'}\n\n`;

    // Show improvements if available (filter out boilerplate)
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

    // Show action items if available (filter out boilerplate)
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
 */
export function generateGateHealthSection(gateHealth) {
  if (!gateHealth || gateHealth.length === 0) {
    return '';
  }

  let section = `## 🏥 Gate Health Monitor (Auto-Updated)

**ATTENTION**: These gates are below the 80% pass rate threshold and may need remediation.

| Gate | Pass Rate | Attempts | Failures | Status |
|------|-----------|----------|----------|--------|
`;

  gateHealth.forEach(g => {
    const statusIcon = g.pass_rate < 50 ? '🔴' : g.pass_rate < 70 ? '🟠' : '🟡';
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
 */
export function generateProposalsSection(proposals) {
  if (!proposals || proposals.length === 0) {
    return '';
  }

  let section = `## 📋 Proactive SD Proposals (LEO v4.4)

**ACTION REQUIRED**: These are AI-generated proposals awaiting chairman approval.

`;

  proposals.forEach((p, idx) => {
    const urgencyIcon = p.urgency_level === 'critical' ? '🔴' :
                        p.urgency_level === 'medium' ? '🟡' : '🟢';
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
 */
export function generateAutonomousDirectivesSection(directives, phase) {
  if (!directives || directives.length === 0) {
    return '';
  }

  // Filter directives for this phase
  const phaseDirectives = directives.filter(d =>
    d.applies_to_phases && d.applies_to_phases.includes(phase)
  );

  if (phaseDirectives.length === 0) {
    return '';
  }

  // Separate by enforcement point
  const alwaysDirectives = phaseDirectives.filter(d => d.enforcement_point === 'ALWAYS');
  const onFailureDirectives = phaseDirectives.filter(d => d.enforcement_point === 'ON_FAILURE');
  const handoffDirectives = phaseDirectives.filter(d => d.enforcement_point === 'HANDOFF_START');

  let section = `## Autonomous Continuation Directives

**CRITICAL**: These directives guide autonomous agent behavior during ${phase} phase execution.

`;

  // ALWAYS directives - shown prominently
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

  // HANDOFF_START directives - shown at phase transitions
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

  // ON_FAILURE directives - conditional reminders
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

/**
 * Generate agent section for CLAUDE_CORE.md
 */
export function generateAgentSection(agents) {
  let table = '| Agent | Code | Responsibilities | % Split |\n';
  table += '|-------|------|------------------|----------|\n';

  agents.forEach(agent => {
    const responsibilities = agent.responsibilities.substring(0, 80) + (agent.responsibilities.length > 80 ? '...' : '');
    const percentages = [];
    if (agent.planning_percentage) percentages.push(`P:${agent.planning_percentage}`);
    if (agent.implementation_percentage) percentages.push(`I:${agent.implementation_percentage}`);
    if (agent.verification_percentage) percentages.push(`V:${agent.verification_percentage}`);
    if (agent.approval_percentage) percentages.push(`A:${agent.approval_percentage}`);
    const split = percentages.join(' ') + ` = ${agent.total_percentage}%`;

    table += `| ${agent.name} | ${agent.agent_code} | ${responsibilities} | ${split} |\n`;
  });

  table += '\n**Legend**: P=Planning, I=Implementation, V=Verification, A=Approval\n';
  table += '**Total**: EXEC (30%) + LEAD (35%) + PLAN (35%) = 100%';

  return table;
}

/**
 * Generate sub-agent section for CLAUDE_CORE.md
 */
export function generateSubAgentSection(subAgents) {
  if (!subAgents || subAgents.length === 0) {
    return '';
  }

  let section = `## Available Sub-Agents

**Usage**: Invoke sub-agents using the Task tool with matching subagent_type.
**IMPORTANT**: When user query contains trigger keywords, PROACTIVELY invoke the corresponding sub-agent.

`;

  // Group sub-agents by whether they have triggers or not
  const withTriggers = subAgents.filter(sa => sa.triggers && sa.triggers.length > 0);
  const withoutTriggers = subAgents.filter(sa => !sa.triggers || sa.triggers.length === 0);

  if (withoutTriggers.length > 0) {
    section += '### Sub-Agents Without Keyword Triggers\n\n';
    withoutTriggers.forEach(sa => {
      section += `- **${sa.name}** (\`${sa.code || 'N/A'}\`): ${sa.description?.substring(0, 80) || 'N/A'}\n`;
    });
    section += '\n';
  }

  section += '### Keyword-Triggered Sub-Agents\n\n';

  withTriggers.forEach(sa => {
    // Extract all trigger_phrases from triggers array
    const triggers = sa.triggers?.map(t => t.trigger_phrase).filter(Boolean) || [];
    const desc = sa.description?.substring(0, 100) || 'N/A';

    section += `#### ${sa.name} (\`${sa.code || 'N/A'}\`)\n`;
    section += `${desc}\n\n`;

    if (triggers.length > 0) {
      section += `**Trigger Keywords**: \`${triggers.join('\`, \`')}\`\n\n`;
    }
  });

  section += `
**Note**: Sub-agent results MUST be persisted to \`sub_agent_execution_results\` table.
`;

  return section;
}

/**
 * Generate a compact trigger keyword reference for the router file
 */
export function generateTriggerQuickReference(subAgents) {
  if (!subAgents || subAgents.length === 0) {
    return '';
  }

  // Build keyword -> sub-agent mapping
  const keywordMap = {};
  subAgents.forEach(sa => {
    if (!sa.triggers || sa.triggers.length === 0) return;
    sa.triggers.forEach(t => {
      if (t.trigger_phrase) {
        const keyword = t.trigger_phrase.toLowerCase();
        if (!keywordMap[keyword]) {
          keywordMap[keyword] = { agent: sa.code, priority: t.priority || sa.priority || 50 };
        }
      }
    });
  });

  // Group by sub-agent for compact display
  const agentKeywords = {};
  Object.entries(keywordMap).forEach(([keyword, info]) => {
    if (!agentKeywords[info.agent]) {
      agentKeywords[info.agent] = [];
    }
    agentKeywords[info.agent].push(keyword);
  });

  let section = `## Sub-Agent Trigger Keywords (Quick Reference)

**CRITICAL**: When user query contains these keywords, PROACTIVELY invoke the corresponding sub-agent via Task tool.

| Sub-Agent | Trigger Keywords |
|-----------|------------------|
`;

  // Sort by agent code for consistency
  Object.keys(agentKeywords).sort().forEach(agent => {
    const keywords = agentKeywords[agent].slice(0, 10); // Limit to top 10 keywords per agent
    const moreCount = agentKeywords[agent].length - 10;
    let keywordStr = keywords.join(', ');
    if (moreCount > 0) {
      keywordStr += ` (+${moreCount} more)`;
    }
    section += `| \`${agent}\` | ${keywordStr} |\n`;
  });

  section += `
*Full trigger list in CLAUDE_CORE.md. Use Task tool with \`subagent_type="<agent-code>"\`*
`;

  return section;
}

/**
 * Generate handoff templates section
 */
export function generateHandoffTemplates(templates) {
  if (!templates || templates.length === 0) return 'No templates in database';

  // Helper to extract section names from template_structure JSONB
  const extractSections = (templateStructure) => {
    if (!templateStructure) return 'Not defined';
    const sections = templateStructure.sections;
    if (!sections) return 'Not defined';
    if (Array.isArray(sections)) {
      return sections.map(s => {
        if (typeof s === 'string') return s;
        if (s?.title) return s.title;
        if (s?.name) return s.name;
        return safeJson(s);
      }).join(', ');
    }
    return safeJson(sections);
  };

  // Helper to format required_elements JSONB
  const formatRequired = (requiredElements) => {
    if (!requiredElements) return 'None specified';
    if (Array.isArray(requiredElements)) {
      return requiredElements.map(el => typeof el === 'string' ? el : safeJson(el)).join(', ');
    }
    return safeJson(requiredElements);
  };

  return templates.map(t => `
#### ${t.from_agent || 'Unknown'} → ${t.to_agent || 'Unknown'} (${t.handoff_type || 'N/A'})
- **Elements**: ${extractSections(t.template_structure)}
- **Required**: ${formatRequired(t.required_elements)}
`).join('\n');
}

/**
 * Generate validation rules section
 */
export function generateValidationRules(rules) {
  if (!rules || rules.length === 0) return 'No validation rules in database';

  // Helper to safely stringify JSONB criteria
  const formatCriteria = (criteria) => {
    if (!criteria) return 'Not specified';
    if (typeof criteria === 'string') return criteria;
    try {
      if (typeof criteria === 'object') {
        const keys = Object.keys(criteria);
        if (keys.length <= 3) {
          return keys.map(k => `${k}: ${JSON.stringify(criteria[k])}`).join('; ');
        }
        return `${keys.length} criteria defined (${keys.slice(0, 3).join(', ')}...)`;
      }
      return JSON.stringify(criteria);
    } catch {
      return String(criteria);
    }
  };

  return rules.map(r => `
- **${r.rule_name || 'Unnamed Rule'}** (Gate ${r.gate || 'N/A'})
  - Weight: ${r.weight ?? 'N/A'}
  - Required: ${r.required ? 'Yes' : 'No'}
  - Criteria: ${formatCriteria(r.criteria)}
`).join('\n');
}
