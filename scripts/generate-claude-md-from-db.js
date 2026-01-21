#!/usr/bin/env node
/**
 * Generate Modular CLAUDE Files from Database (V3 - Router Architecture)
 * Creates 5 files: CLAUDE.md (router), CLAUDE_CORE.md, CLAUDE_LEAD.md, CLAUDE_PLAN.md, CLAUDE_EXEC.md
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Use service role key for full access to LEO tables (anon key blocked by RLS)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.log('⚠️ CLAUDE files will not be updated');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class CLAUDEMDGeneratorV3 {
  constructor() {
    this.baseDir = path.join(__dirname, '..');
    this.mappingPath = path.join(__dirname, 'section-file-mapping.json');
    this.fileMapping = null;
  }

  loadMapping() {
    if (!fs.existsSync(this.mappingPath)) {
      throw new Error(`Mapping file not found: ${this.mappingPath}`);
    }
    this.fileMapping = JSON.parse(fs.readFileSync(this.mappingPath, 'utf-8'));
    console.log('✅ Loaded section-to-file mapping');
  }

  async generate() {
    console.log('🔄 Generating modular CLAUDE files from database (V3 - Router Architecture)...\n');

    try {
      // Load mapping
      this.loadMapping();

      // Fetch all required data
      const protocol = await this.getActiveProtocol();
      const agents = await this.getAgents();
      const subAgents = await this.getSubAgents();
      const handoffTemplates = await this.getHandoffTemplates();
      const validationRules = await this.getValidationRules();
      const schemaConstraints = await this.getSchemaConstraints();
      const processScripts = await this.getProcessScripts();

      // LEO Protocol v4.3.2 Enhancement: Fetch operational intelligence
      const hotPatterns = await this.getHotPatterns(5);
      const recentRetrospectives = await this.getRecentRetrospectives(30, 5);

      // LEO Protocol Enhancement: Gate health metrics for self-improvement
      const gateHealth = await this.getGateHealth();

      // LEO Protocol v4.4 Enhancement: Proactive SD proposals
      const pendingProposals = await this.getPendingProposals();

      // SD-LEO-CONTINUITY-001: Autonomous continuation directives
      const autonomousDirectives = await this.getAutonomousDirectives();

      const data = {
        protocol,
        agents,
        subAgents,
        handoffTemplates,
        validationRules,
        schemaConstraints,
        processScripts,
        hotPatterns,
        recentRetrospectives,
        gateHealth,
        pendingProposals,
        autonomousDirectives
      };

      // Generate each file
      console.log('📝 Generating files...\n');

      this.generateFile('CLAUDE.md', data, this.generateRouter.bind(this));
      this.generateFile('CLAUDE_CORE.md', data, this.generateCore.bind(this));
      this.generateFile('CLAUDE_LEAD.md', data, this.generateLead.bind(this));
      this.generateFile('CLAUDE_PLAN.md', data, this.generatePlan.bind(this));
      this.generateFile('CLAUDE_EXEC.md', data, this.generateExec.bind(this));

      console.log('\n✅ All CLAUDE files generated successfully!');
      console.log(`📄 Protocol Version: LEO v${protocol.version}`);
      console.log(`📊 Sub-agents: ${subAgents.length}`);
      console.log(`📋 Handoff templates: ${handoffTemplates.length}`);
      console.log(`📚 Protocol sections: ${protocol.sections.length}`);
      console.log(`🔥 Hot patterns: ${hotPatterns.length}`);
      console.log(`📝 Recent retrospectives: ${recentRetrospectives.length}`);
      console.log(`📋 Pending proposals: ${pendingProposals.length}`);
      console.log(`🤖 Autonomous directives: ${autonomousDirectives.length}`);
      console.log('\n🎯 Router architecture implemented!');
      console.log('   → Initial context load: ~18k chars (9% of 200k budget)');
      console.log('   → Down from: 173k chars (87% of budget)');
      console.log('   → Now includes: operational intelligence (patterns + lessons)');

    } catch (error) {
      console.error('❌ Generation failed:', error);
      process.exit(1);
    }
  }

  generateFile(filename, data, generatorFn) {
    const filePath = path.join(this.baseDir, filename);
    const content = generatorFn(data);
    fs.writeFileSync(filePath, content);

    const size = (content.length / 1024).toFixed(1);
    const charCount = content.length;
    console.log(`   ✓ ${filename.padEnd(20)} ${size.padStart(6)} KB (${charCount} chars)`);
  }

  async getActiveProtocol() {
    const { data, error } = await supabase
      .from('leo_protocols')
      .select('*')
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error('No active protocol found in database');
    }

    // Get sections (ordered)
    const { data: sections } = await supabase
      .from('leo_protocol_sections')
      .select('*')
      .eq('protocol_id', data.id)
      .order('order_index');

    data.sections = sections || [];
    return data;
  }

  async getAgents() {
    const { data } = await supabase
      .from('leo_agents')
      .select('*')
      .order('agent_code');

    return data || [];
  }

  async getSubAgents() {
    const { data } = await supabase
      .from('leo_sub_agents')
      .select(`
        *,
        triggers:leo_sub_agent_triggers(*)
      `)
      .eq('active', true)
      .order('priority', { ascending: false });

    return data || [];
  }

  async getHandoffTemplates() {
    const { data } = await supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('active', true);

    return data || [];
  }

  async getValidationRules() {
    const { data } = await supabase
      .from('leo_validation_rules')
      .select('*')
      .eq('active', true);

    return data || [];
  }

  async getSchemaConstraints() {
    const { data, error } = await supabase
      .from('leo_schema_constraints')
      .select('*')
      .order('table_name');

    if (error) {
      console.warn('⚠️  Could not load schema constraints (table may not exist yet)');
      return [];
    }

    return data || [];
  }

  async getProcessScripts() {
    const { data, error } = await supabase
      .from('leo_process_scripts')
      .select('*')
      .eq('active', true)
      .order('category');

    if (error) {
      console.warn('⚠️  Could not load process scripts (table may not exist yet)');
      return [];
    }

    return data || [];
  }

  /**
   * Fetch hot issue patterns - active patterns with high occurrence or increasing trend
   * Part of LEO Protocol v4.3.2 enhancement for proactive knowledge surfacing
   */
  async getHotPatterns(limit = 5) {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('*')
      .eq('status', 'active')
      .or('trend.eq.increasing,severity.eq.critical,severity.eq.high')
      .order('occurrence_count', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('⚠️  Could not load issue patterns (table may not exist yet)');
      return [];
    }

    return data || [];
  }

  /**
   * Fetch recent published retrospectives for lessons learned
   * Part of LEO Protocol v4.3.2 enhancement for proactive knowledge surfacing
   */
  async getRecentRetrospectives(days = 30, limit = 5) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await supabase
      .from('retrospectives')
      .select('id, sd_id, title, what_needs_improvement, action_items, learning_category, quality_score, conducted_date')
      .gte('conducted_date', since.toISOString())
      .eq('status', 'PUBLISHED')
      .order('quality_score', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('⚠️  Could not load retrospectives (table may not exist yet)');
      return [];
    }

    return data || [];
  }

  /**
   * Fetch gate health metrics for self-improvement monitoring
   * Shows gates with pass rates below threshold
   */
  async getGateHealth() {
    try {
      // Try the materialized view first
      const { data, error } = await supabase
        .from('v_gate_health_metrics')
        .select('*')
        .lt('pass_rate', 80)
        .order('pass_rate', { ascending: true })
        .limit(5);

      if (error) {
        // View might not exist, try direct query
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('leo_gate_reviews')
          .select('gate, score')
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        if (fallbackError) {
          console.warn('⚠️  Could not load gate health (tables may not exist yet)');
          return [];
        }

        // Aggregate manually if view doesn't exist
        const byGate = {};
        (fallbackData || []).forEach(r => {
          if (!byGate[r.gate]) byGate[r.gate] = { passes: 0, failures: 0 };
          if (r.score >= 85) byGate[r.gate].passes++;
          else byGate[r.gate].failures++;
        });

        return Object.entries(byGate)
          .map(([gate, stats]) => ({
            gate,
            pass_rate: Math.round(100 * stats.passes / (stats.passes + stats.failures)),
            total_attempts: stats.passes + stats.failures,
            failures: stats.failures
          }))
          .filter(g => g.pass_rate < 80)
          .sort((a, b) => a.pass_rate - b.pass_rate)
          .slice(0, 5);
      }

      return data || [];
    } catch (err) {
      console.warn('⚠️  Could not load gate health:', err.message);
      return [];
    }
  }

  /**
   * Fetch pending SD proposals for proactive surfacing
   * Part of LEO Protocol v4.4 Proactive SD Proposal System
   */
  async getPendingProposals(limit = 5) {
    try {
      const { data, error } = await supabase
        .from('sd_proposals')
        .select('*')
        .eq('status', 'pending')
        .order('urgency_level', { ascending: true }) // critical first (alphabetically)
        .order('confidence_score', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('⚠️  Could not load proposals (table may not exist yet)');
        return [];
      }

      return data || [];
    } catch (err) {
      console.warn('⚠️  Could not load proposals:', err.message);
      return [];
    }
  }

  /**
   * Fetch autonomous continuation directives
   * Part of SD-LEO-CONTINUITY-001 - Autonomous Continuation Directives
   */
  async getAutonomousDirectives() {
    try {
      const { data, error } = await supabase
        .from('leo_autonomous_directives')
        .select('*')
        .eq('active', true)
        .order('display_order');

      if (error) {
        console.warn('⚠️  Could not load autonomous directives (table may not exist yet)');
        return [];
      }

      return data || [];
    } catch (err) {
      console.warn('⚠️  Could not load autonomous directives:', err.message);
      return [];
    }
  }

  getSectionsByMapping(sections, fileKey) {
    const mappedTypes = this.fileMapping[fileKey]?.sections || [];
    return sections.filter(s => mappedTypes.includes(s.section_type));
  }

  formatSection(section) {
    // Remove duplicate header if content already starts with ## Title
    let content = section.content;
    const headerPattern = new RegExp(`^##\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`, 'i');
    content = content.replace(headerPattern, '');
    return `## ${section.title}\n\n${content}`;
  }

  getMetadata(protocol) {
    const today = new Date().toISOString().split('T')[0];
    const time = new Date().toLocaleTimeString();
    return { today, time, protocol };
  }

  generateRouter(data) {
    const { protocol, subAgents } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get router-specific sections
    const fileWarning = sections.find(s => s.section_type === 'file_warning');
    const smartRouter = sections.find(s => s.section_type === 'smart_router');
    const sessionPrologue = sections.find(s => s.section_type === 'session_prologue');
    const sessionInit = sections.find(s => s.section_type === 'session_init');
    const skillIntentDetection = sections.find(s => s.section_type === 'skill_intent_detection');
    const commonCommands = sections.find(s => s.section_type === 'common_commands');

    // Generate trigger quick reference for router
    const triggerReference = this.generateTriggerQuickReference(subAgents);

    return `# CLAUDE.md - LEO Protocol Context Router

${fileWarning ? fileWarning.content : '⚠️ DO NOT EDIT THIS FILE DIRECTLY - Generated from database'}

${sessionPrologue ? this.formatSection(sessionPrologue) : ''}

${sessionInit ? this.formatSection(sessionInit) : ''}

${skillIntentDetection ? this.formatSection(skillIntentDetection) : ''}

${commonCommands ? commonCommands.content : ''}

## ⚠️ DYNAMICALLY GENERATED FROM DATABASE
**Last Generated**: ${today} ${time}
**Source**: Supabase Database (not files)
**Auto-Update**: Run \`node scripts/generate-claude-md-from-db.js\` anytime

## 🟢 CURRENT LEO PROTOCOL VERSION: ${protocol.version}

**CRITICAL**: This is the ACTIVE version from database
**ID**: ${protocol.id}
**Status**: ${protocol.status.toUpperCase()}
**Title**: ${protocol.title}

${smartRouter ? smartRouter.content : '## Context Router\n\n**Load Strategy**: Read CLAUDE_CORE.md first, then phase-specific files as needed.'}

${triggerReference}

---

*Router generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Part of LEO Protocol router architecture*
`;
  }

  generateCore(data) {
    const { protocol, agents, subAgents, hotPatterns, recentRetrospectives, gateHealth, pendingProposals } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get core sections
    const coreSections = this.getSectionsByMapping(sections, 'CLAUDE_CORE.md');
    const coreContent = coreSections.map(s => this.formatSection(s)).join('\n\n');

    // Generate sub-agent reference
    const subAgentSection = this.generateSubAgentSection(subAgents);

    // LEO Protocol v4.3.2 Enhancement: Operational intelligence sections
    const hotPatternsSection = this.generateHotPatternsSection(hotPatterns);
    const recentLessonsSection = this.generateRecentLessonsSection(recentRetrospectives);

    // Gate health section for self-improvement
    const gateHealthSection = this.generateGateHealthSection(gateHealth);

    // LEO Protocol v4.4 Enhancement: Proactive SD proposals
    const proposalsSection = this.generateProposalsSection(pendingProposals);

    return `# CLAUDE_CORE.md - LEO Protocol Core Context

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: Essential workflow context for all sessions (15-20k chars)

---

${coreContent}

${proposalsSection}

${hotPatternsSection}

${gateHealthSection}

${recentLessonsSection}

## Agent Responsibilities

${this.generateAgentSection(agents)}

## Progress Calculation

\`\`\`
Total = ${agents.map(a => `${a.agent_code}: ${a.total_percentage}%`).join(' + ')} = 100%
\`\`\`

${subAgentSection}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Includes: Proposals (${pendingProposals?.length || 0}) + Hot Patterns (${hotPatterns?.length || 0}) + Lessons (${recentRetrospectives?.length || 0})*
*Load this file first in all sessions*
`;
  }

  generateLead(data) {
    const { protocol, autonomousDirectives } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get LEAD sections
    const leadSections = this.getSectionsByMapping(sections, 'CLAUDE_LEAD.md');
    const leadContent = leadSections.map(s => this.formatSection(s)).join('\n\n');

    // SD-LEO-CONTINUITY-001: Generate autonomous directives section for LEAD phase
    const directivesSection = this.generateAutonomousDirectivesSection(autonomousDirectives, 'LEAD');

    return `# CLAUDE_LEAD.md - LEAD Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: LEAD agent operations and strategic validation (25-30k chars)

---

${directivesSection}

${leadContent}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions LEAD, approval, strategic validation, or over-engineering*
`;
  }

  generatePlan(data) {
    const { protocol, handoffTemplates, validationRules, autonomousDirectives } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get PLAN sections
    const planSections = this.getSectionsByMapping(sections, 'CLAUDE_PLAN.md');
    const planContent = planSections.map(s => this.formatSection(s)).join('\n\n');

    // SD-LEO-CONTINUITY-001: Generate autonomous directives section for PLAN phase
    const directivesSection = this.generateAutonomousDirectivesSection(autonomousDirectives, 'PLAN');

    return `# CLAUDE_PLAN.md - PLAN Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: PLAN agent operations, PRD creation, validation gates (30-35k chars)

---

${directivesSection}

${planContent}

## Handoff Templates

${this.generateHandoffTemplates(handoffTemplates)}

## Validation Rules

${this.generateValidationRules(validationRules)}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions PLAN, PRD, validation, or testing strategy*
`;
  }

  generateExec(data) {
    const { protocol, schemaConstraints, processScripts, autonomousDirectives } = data;
    const sections = protocol.sections;
    const { today, time } = this.getMetadata(protocol);

    // Get EXEC sections
    const execSections = this.getSectionsByMapping(sections, 'CLAUDE_EXEC.md');
    const execContent = execSections.map(s => this.formatSection(s)).join('\n\n');

    // Generate schema constraints section
    const constraintsSection = this.generateSchemaConstraintsSection(schemaConstraints);

    // Generate process scripts section
    const scriptsSection = this.generateProcessScriptsSection(processScripts);

    // SD-LEO-CONTINUITY-001: Generate autonomous directives section for EXEC phase
    const directivesSection = this.generateAutonomousDirectivesSection(autonomousDirectives, 'EXEC');

    return `# CLAUDE_EXEC.md - EXEC Phase Operations

**Generated**: ${today} ${time}
**Protocol**: LEO ${protocol.version}
**Purpose**: EXEC agent implementation requirements and testing (20-25k chars)

---

${directivesSection}

${execContent}

${constraintsSection}

${scriptsSection}

---

*Generated from database: ${today}*
*Protocol Version: ${protocol.version}*
*Load when: User mentions EXEC, implementation, coding, or testing*
`;
  }

  generateSchemaConstraintsSection(constraints) {
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

  generateProcessScriptsSection(scripts) {
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
   * Shows active patterns with high occurrence or critical severity
   */
  generateHotPatternsSection(patterns) {
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
   * Shows top lessons from published retrospectives in last 30 days
   */
  generateRecentLessonsSection(retrospectives) {
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
            // Filter out boilerplate items (marked with is_boilerplate: true)
            if (typeof item === 'object' && item.is_boilerplate === true) return false;
            return true;
          })
          .slice(0, 2);
        if (improvements.length > 0) {
          section += '**Key Improvements**:\n';
          improvements.forEach(item => {
            // Handle both string and object formats (with boilerplate flag)
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
            // Filter out boilerplate items (marked with is_boilerplate: true)
            if (typeof item === 'object' && item.is_boilerplate === true) return false;
            return true;
          })
          .slice(0, 2);
        if (actions.length > 0) {
          section += '**Action Items**:\n';
          actions.forEach(item => {
            // Handle various action item formats (including boilerplate flag format)
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
   * Shows gates with low pass rates that need attention
   */
  generateGateHealthSection(gateHealth) {
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
   * Part of LEO Protocol v4.4 - shows pending proposals that need attention
   */
  generateProposalsSection(proposals) {
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
   * Part of SD-LEO-CONTINUITY-001 - Provides guidance for autonomous agent behavior
   *
   * @param {Array} directives - All active directives
   * @param {string} phase - The phase to filter for (LEAD, PLAN, EXEC)
   * @returns {string} Markdown section
   */
  generateAutonomousDirectivesSection(directives, phase) {
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

  generateAgentSection(agents) {
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

  generateSubAgentSection(subAgents) {
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
   * Maps keywords to sub-agent codes for quick lookup
   */
  generateTriggerQuickReference(subAgents) {
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
*Full trigger list in CLAUDE_CORE.md. Use Task tool with \`subagent_type="${'<agent-code>'}"\`*
`;

    return section;
  }

  generateHandoffTemplates(templates) {
    if (!templates || templates.length === 0) return 'No templates in database';

    // Helper to safely stringify JSONB
    const safeJson = (val, fallback = 'N/A') => {
      if (val === null || val === undefined) return fallback;
      if (typeof val === 'string') return val;
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return String(val);
      }
    };

    // Helper to extract section names from template_structure JSONB
    const extractSections = (templateStructure) => {
      if (!templateStructure) return 'Not defined';
      const sections = templateStructure.sections;
      if (!sections) return 'Not defined';
      if (Array.isArray(sections)) {
        // Sections could be strings or objects with title/name
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

  generateValidationRules(rules) {
    if (!rules || rules.length === 0) return 'No validation rules in database';

    // Helper to safely stringify JSONB criteria
    const formatCriteria = (criteria) => {
      if (!criteria) return 'Not specified';
      if (typeof criteria === 'string') return criteria;
      try {
        // If criteria is an object, show a summary
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

    // Schema: gate, rule_name, weight, criteria, required, active
    return rules.map(r => `
- **${r.rule_name || 'Unnamed Rule'}** (Gate ${r.gate || 'N/A'})
  - Weight: ${r.weight ?? 'N/A'}
  - Required: ${r.required ? 'Yes' : 'No'}
  - Criteria: ${formatCriteria(r.criteria)}
`).join('\n');
  }
}

// Export for use in other scripts
export { CLAUDEMDGeneratorV3 };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  async function main() {
    const generator = new CLAUDEMDGeneratorV3();
    await generator.generate();
  }

  main().catch(console.error);
}
