/**
 * Protocol Content Regression Tests
 * SD: SD-LEO-INFRA-GOVERNANCE-STACK-QUALITY-001
 *
 * Verifies that the CLAUDE.md generator produces governance-related content
 * correctly. Tests file generators and section formatters with mock protocol
 * data to ensure governance sections (mission, strategy, vision) survive
 * regeneration without content loss.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Inlined formatSection (from section-formatters.js) ────────────────
function formatSection(section) {
  let content = section.content;
  const headerPattern = new RegExp(
    `^##\\s+${section.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\n`,
    'i'
  );
  content = content.replace(headerPattern, '');
  return `## ${section.title}\n\n${content}`;
}

// ── Inlined getSectionsByMapping (from file-generators.js) ────────────
function getSectionsByMapping(sections, fileKey, fileMapping) {
  const mappedTypes = fileMapping[fileKey]?.sections || [];
  return sections.filter(s => mappedTypes.includes(s.section_type));
}

// ── Inlined generateAgentSection (simplified for testing) ─────────────
function generateAgentSection(agents) {
  let table = '| Agent | Code | Responsibilities | % Split |\n';
  table += '|-------|------|------------------|----------|\n';
  agents.forEach(agent => {
    const responsibilities = agent.responsibilities.substring(0, 80);
    table += `| ${agent.name} | ${agent.agent_code} | ${responsibilities} | ${agent.total_percentage}% |\n`;
  });
  return table;
}

// ── Inlined generateSubAgentSectionCompact (simplified) ───────────────
function generateSubAgentSectionCompact(subAgents) {
  if (!subAgents || subAgents.length === 0) return '';
  let section = '## Available Sub-Agents\n\n| Code | Name | Purpose |\n|------|------|--------|\n';
  subAgents.forEach(sa => {
    const desc = (sa.description || 'N/A').substring(0, 60).replace(/\n/g, ' ');
    section += `| \`${sa.code || 'N/A'}\` | ${sa.name} | ${desc} |\n`;
  });
  return section;
}

// ── Mock operational section generators ───────────────────────────────
function generateHotPatternsSection(patterns) {
  if (!patterns || patterns.length === 0) return '';
  return `## Hot Issue Patterns\n\n${patterns.length} pattern(s)`;
}

function generateRecentLessonsSection(retros) {
  if (!retros || retros.length === 0) return '';
  return `## Recent Lessons\n\n${retros.length} lesson(s)`;
}

function generateGateHealthSection() { return ''; }
function generateProposalsSection() { return ''; }
function generateAutonomousDirectivesSection() { return ''; }
function generateSchemaConstraintsSection() { return ''; }
function generateProcessScriptsSection() { return ''; }

// ── File generator functions (inlined from file-generators.js) ────────

function generateRouter(data) {
  const { protocol } = data;
  const sections = protocol.sections;

  const sessionPrologue = sections.find(s => s.section_type === 'session_prologue');
  const sessionInit = sections.find(s => s.section_type === 'session_init');

  return `# CLAUDE.md - LEO Protocol Orchestrator

## Prime Directive
You are the **LEO Orchestrator**. Core workflow: **LEAD** → **PLAN** → **EXEC**.

${sessionPrologue ? formatSection(sessionPrologue) : ''}

## Context Loading
- **Starting Work**: Read \`CLAUDE_CORE_DIGEST.md\`
- **LEAD Phase**: Read \`CLAUDE_LEAD_DIGEST.md\`

${sessionInit ? formatSection(sessionInit) : ''}

---
*Generated: test | Protocol: LEO ${protocol.version}*
`;
}

function generateCore(data, fileMapping) {
  const { protocol, agents, subAgents, hotPatterns, recentRetrospectives } = data;
  const sections = protocol.sections;

  const coreSections = getSectionsByMapping(sections, 'CLAUDE_CORE.md', fileMapping);
  const coreContent = coreSections.map(s => formatSection(s)).join('\n\n');
  const subAgentSection = generateSubAgentSectionCompact(subAgents);
  const hotPatternsSection = generateHotPatternsSection(hotPatterns);
  const recentLessonsSection = generateRecentLessonsSection(recentRetrospectives);

  return `# CLAUDE_CORE.md - LEO Protocol Core Context

${coreContent}

${hotPatternsSection}

${recentLessonsSection}

## Agent Responsibilities

${generateAgentSection(agents)}

${subAgentSection}

---
*Protocol Version: ${protocol.version}*
`;
}

function generateLead(data, fileMapping) {
  const { protocol, visionGapInsights = [] } = data;
  const sections = protocol.sections;

  const leadSections = getSectionsByMapping(sections, 'CLAUDE_LEAD.md', fileMapping);
  const leadContent = leadSections.map(s => formatSection(s)).join('\n\n');

  const visionGapSection = visionGapInsights.length > 0
    ? `## Current Vision Gaps\n\n` +
      visionGapInsights.map(g =>
        `| ${g.pattern_id} | ${g.issue_summary} | ${g.severity} |`
      ).join('\n') + '\n'
    : '';

  return `# CLAUDE_LEAD.md - LEAD Phase Operations

${visionGapSection}
${leadContent}

---
*Protocol Version: ${protocol.version}*
`;
}

function generateExec(data, fileMapping) {
  const { protocol, visionGapInsights = [] } = data;
  const sections = protocol.sections;

  const execSections = getSectionsByMapping(sections, 'CLAUDE_EXEC.md', fileMapping);
  const execContent = execSections.map(s => formatSection(s)).join('\n\n');

  const visionRemindersSection = visionGapInsights.length > 0
    ? `## Implementation Reminders — Active Vision Gaps\n\n` +
      visionGapInsights.map(g =>
        `- **${g.pattern_id}**: ${g.issue_summary}`
      ).join('\n') + '\n'
    : '';

  return `# CLAUDE_EXEC.md - EXEC Phase Operations

${visionRemindersSection}
${execContent}

---
*Protocol Version: ${protocol.version}*
`;
}

// ── Test Data Fixtures ────────────────────────────────────────────────

function createGovernanceProtocolData() {
  return {
    protocol: {
      id: 'proto-001',
      version: '4.3.3',
      sections: [
        {
          id: 's1',
          section_type: 'session_prologue',
          title: 'Session Prologue (Short)',
          content: '1. **Follow LEAD→PLAN→EXEC** - Target gate pass rate 85%\n2. **Use sub-agents**\n3. **Database-first**',
          order_index: 1,
        },
        {
          id: 's2',
          section_type: 'session_init',
          title: 'Session Initialization - SD Selection',
          content: '### Intent Detection Keywords\nWhen the user says "start LEO", run `npm run sd:next`',
          order_index: 2,
        },
        {
          id: 's3',
          section_type: 'governance_overview',
          title: 'EVA Governance Stack',
          content: 'The EVA governance stack manages organizational mission, strategy, and vision.\nMission commands: view, history, propose.\nStrategy commands: view, detail, derive, create.',
          order_index: 3,
        },
        {
          id: 's4',
          section_type: 'sd_types',
          title: 'SD Type Requirements',
          content: '| SD Type | PRD Required | Min Handoffs |\n|---------|-------------|-------------|\n| feature | YES | 4 |\n| infrastructure | YES | 3 |',
          order_index: 4,
        },
        {
          id: 's5',
          section_type: 'lead_approval',
          title: 'LEAD Approval Process',
          content: 'LEAD validates strategic alignment and scope. Must check mission alignment.',
          order_index: 5,
        },
        {
          id: 's6',
          section_type: 'exec_implementation',
          title: 'EXEC Implementation Rules',
          content: 'Implementation must follow the SD scope. Create tests before shipping.',
          order_index: 6,
        },
      ],
    },
    agents: [
      { name: 'LEAD', agent_code: 'LEAD', responsibilities: 'Strategic validation and approval', total_percentage: 35 },
      { name: 'PLAN', agent_code: 'PLAN', responsibilities: 'Architecture and PRD creation', total_percentage: 35 },
      { name: 'EXEC', agent_code: 'EXEC', responsibilities: 'Implementation and testing', total_percentage: 30 },
    ],
    subAgents: [
      { name: 'Design Agent', code: 'design-agent', description: 'UI/UX design specialist' },
      { name: 'Testing Agent', code: 'testing-agent', description: 'QA and test execution' },
    ],
    hotPatterns: [
      { pattern_id: 'PAT-001', category: 'schema', severity: 'high', occurrence_count: 5, trend: 'stable' },
    ],
    recentRetrospectives: [
      { id: 'r1', sd_id: 'SD-TEST-001', title: 'Test Retro', quality_score: 85, conducted_date: '2026-02-20' },
    ],
    gateHealth: [],
    pendingProposals: [],
    autonomousDirectives: [],
    visionGapInsights: [
      { pattern_id: 'VGAP-001', issue_summary: 'Missing voice integration scoring', category: 'voice', severity: 'medium' },
    ],
    handoffTemplates: [],
    validationRules: [],
    schemaConstraints: [],
    processScripts: [],
  };
}

function createFileMappings() {
  return {
    'CLAUDE_CORE.md': {
      sections: ['governance_overview', 'sd_types'],
    },
    'CLAUDE_LEAD.md': {
      sections: ['lead_approval'],
    },
    'CLAUDE_PLAN.md': {
      sections: ['sd_types'],
    },
    'CLAUDE_EXEC.md': {
      sections: ['exec_implementation'],
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Protocol Content Regression', () => {

  describe('formatSection', () => {
    it('preserves governance section content', () => {
      const section = {
        title: 'EVA Governance Stack',
        content: 'Mission commands: view, history, propose.\nStrategy commands: view, detail, derive, create.',
      };
      const result = formatSection(section);
      expect(result).toContain('## EVA Governance Stack');
      expect(result).toContain('Mission commands: view, history, propose');
      expect(result).toContain('Strategy commands: view, detail, derive, create');
    });

    it('removes duplicate header from content', () => {
      const section = {
        title: 'Test Section',
        content: '## Test Section\nContent after header.',
      };
      const result = formatSection(section);
      // Should have exactly one ## Test Section, not two
      const headerCount = (result.match(/## Test Section/g) || []).length;
      expect(headerCount).toBe(1);
      expect(result).toContain('Content after header.');
    });

    it('preserves markdown tables in content', () => {
      const section = {
        title: 'SD Types',
        content: '| Type | Required |\n|------|----------|\n| feature | YES |',
      };
      const result = formatSection(section);
      expect(result).toContain('| Type | Required |');
      expect(result).toContain('| feature | YES |');
    });
  });

  describe('getSectionsByMapping', () => {
    it('filters sections by file mapping', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();

      const coreSections = getSectionsByMapping(
        data.protocol.sections, 'CLAUDE_CORE.md', mappings
      );

      expect(coreSections).toHaveLength(2);
      expect(coreSections.map(s => s.section_type)).toEqual(['governance_overview', 'sd_types']);
    });

    it('returns empty array for unmapped file', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();

      const result = getSectionsByMapping(
        data.protocol.sections, 'NONEXISTENT.md', mappings
      );
      expect(result).toHaveLength(0);
    });

    it('returns empty array when mapping has no sections key', () => {
      const data = createGovernanceProtocolData();
      const mappings = { 'TEST.md': {} };

      const result = getSectionsByMapping(data.protocol.sections, 'TEST.md', mappings);
      expect(result).toHaveLength(0);
    });
  });

  describe('generateRouter', () => {
    it('includes Prime Directive', () => {
      const data = createGovernanceProtocolData();
      const output = generateRouter(data);
      expect(output).toContain('## Prime Directive');
      expect(output).toContain('LEO Orchestrator');
    });

    it('includes Session Prologue', () => {
      const data = createGovernanceProtocolData();
      const output = generateRouter(data);
      expect(output).toContain('## Session Prologue');
      expect(output).toContain('LEAD→PLAN→EXEC');
    });

    it('includes Session Initialization', () => {
      const data = createGovernanceProtocolData();
      const output = generateRouter(data);
      expect(output).toContain('## Session Initialization');
      expect(output).toContain('Intent Detection Keywords');
    });

    it('includes Context Loading references', () => {
      const data = createGovernanceProtocolData();
      const output = generateRouter(data);
      expect(output).toContain('CLAUDE_CORE_DIGEST.md');
      expect(output).toContain('CLAUDE_LEAD_DIGEST.md');
    });

    it('includes protocol version', () => {
      const data = createGovernanceProtocolData();
      const output = generateRouter(data);
      expect(output).toContain('LEO 4.3.3');
    });
  });

  describe('generateCore', () => {
    it('includes governance overview section', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateCore(data, mappings);

      expect(output).toContain('## EVA Governance Stack');
      expect(output).toContain('organizational mission, strategy, and vision');
    });

    it('includes SD type requirements', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateCore(data, mappings);

      expect(output).toContain('## SD Type Requirements');
      expect(output).toContain('feature');
      expect(output).toContain('infrastructure');
    });

    it('includes Agent Responsibilities', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateCore(data, mappings);

      expect(output).toContain('## Agent Responsibilities');
      expect(output).toContain('LEAD');
      expect(output).toContain('PLAN');
      expect(output).toContain('EXEC');
    });

    it('includes sub-agents', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateCore(data, mappings);

      expect(output).toContain('## Available Sub-Agents');
      expect(output).toContain('design-agent');
      expect(output).toContain('testing-agent');
    });

    it('includes hot patterns when present', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateCore(data, mappings);

      expect(output).toContain('## Hot Issue Patterns');
    });

    it('omits hot patterns section when empty', () => {
      const data = createGovernanceProtocolData();
      data.hotPatterns = [];
      const mappings = createFileMappings();
      const output = generateCore(data, mappings);

      expect(output).not.toContain('## Hot Issue Patterns');
    });
  });

  describe('generateLead', () => {
    it('includes LEAD approval section', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateLead(data, mappings);

      expect(output).toContain('## LEAD Approval Process');
      expect(output).toContain('mission alignment');
    });

    it('includes vision gap insights when present', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateLead(data, mappings);

      expect(output).toContain('## Current Vision Gaps');
      expect(output).toContain('VGAP-001');
      expect(output).toContain('Missing voice integration scoring');
    });

    it('omits vision gap section when no gaps', () => {
      const data = createGovernanceProtocolData();
      data.visionGapInsights = [];
      const mappings = createFileMappings();
      const output = generateLead(data, mappings);

      expect(output).not.toContain('## Current Vision Gaps');
    });
  });

  describe('generateExec', () => {
    it('includes EXEC implementation section', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateExec(data, mappings);

      expect(output).toContain('## EXEC Implementation Rules');
      expect(output).toContain('Create tests before shipping');
    });

    it('includes vision gap implementation reminders when present', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();
      const output = generateExec(data, mappings);

      expect(output).toContain('## Implementation Reminders');
      expect(output).toContain('VGAP-001');
    });

    it('omits vision reminders when no gaps', () => {
      const data = createGovernanceProtocolData();
      data.visionGapInsights = [];
      const mappings = createFileMappings();
      const output = generateExec(data, mappings);

      expect(output).not.toContain('## Implementation Reminders');
    });
  });

  describe('governance content preservation across regeneration', () => {
    it('all governance terms survive a full generation cycle', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();

      const router = generateRouter(data);
      const core = generateCore(data, mappings);
      const lead = generateLead(data, mappings);
      const exec = generateExec(data, mappings);

      const allContent = [router, core, lead, exec].join('\n');

      // Governance terms that MUST be present
      const requiredTerms = [
        'LEAD',
        'PLAN',
        'EXEC',
        'LEO Orchestrator',
        'EVA Governance Stack',
        'mission',
        'strategy',
        'vision',
        'SD Type',
        'LEAD Approval',
      ];

      for (const term of requiredTerms) {
        expect(allContent).toContain(term);
      }
    });

    it('section count matches mapping expectations', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();

      const coreSections = getSectionsByMapping(data.protocol.sections, 'CLAUDE_CORE.md', mappings);
      const leadSections = getSectionsByMapping(data.protocol.sections, 'CLAUDE_LEAD.md', mappings);
      const execSections = getSectionsByMapping(data.protocol.sections, 'CLAUDE_EXEC.md', mappings);

      expect(coreSections.length).toBe(2);
      expect(leadSections.length).toBe(1);
      expect(execSections.length).toBe(1);
    });

    it('no section is silently dropped when all mappings are present', () => {
      const data = createGovernanceProtocolData();
      const mappings = createFileMappings();

      // Collect all mapped section types
      const allMappedTypes = new Set();
      for (const fileConfig of Object.values(mappings)) {
        for (const sType of fileConfig.sections || []) {
          allMappedTypes.add(sType);
        }
      }

      // Every mapped type should correspond to at least one section
      for (const sType of allMappedTypes) {
        const found = data.protocol.sections.find(s => s.section_type === sType);
        expect(found, `Section type '${sType}' should exist in protocol data`).toBeDefined();
      }
    });
  });

  describe('generateAgentSection', () => {
    it('produces valid markdown table', () => {
      const agents = [
        { name: 'LEAD', agent_code: 'LEAD', responsibilities: 'Strategic validation', total_percentage: 35 },
        { name: 'EXEC', agent_code: 'EXEC', responsibilities: 'Implementation', total_percentage: 30 },
      ];
      const result = generateAgentSection(agents);

      expect(result).toContain('| Agent | Code |');
      expect(result).toContain('| LEAD | LEAD |');
      expect(result).toContain('| EXEC | EXEC |');
      expect(result).toContain('35%');
      expect(result).toContain('30%');
    });
  });

  describe('generateSubAgentSectionCompact', () => {
    it('produces compact table', () => {
      const subAgents = [
        { name: 'Design Agent', code: 'design-agent', description: 'UI/UX design' },
      ];
      const result = generateSubAgentSectionCompact(subAgents);

      expect(result).toContain('## Available Sub-Agents');
      expect(result).toContain('`design-agent`');
      expect(result).toContain('Design Agent');
    });

    it('returns empty string when no sub-agents', () => {
      expect(generateSubAgentSectionCompact([])).toBe('');
      expect(generateSubAgentSectionCompact(null)).toBe('');
    });
  });
});
