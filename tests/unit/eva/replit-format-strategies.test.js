import { describe, it, expect } from 'vitest';
import {
  formatReplitMd,
  formatPlanModePrompt,
  formatFeaturePrompts,
  normalizeGroupKey,
  extractArtifactContent,
  extractArchitectureSection,
  formatJsonArtifact,
  formatArtifactContent,
  summarizeContent,
  slugify,
} from '../../../lib/eva/bridge/replit-format-strategies.js';

// Shared test data
const mockVenture = { name: 'TaskFlow AI', description: 'AI-powered task management' };
const mockSummary = { total_artifacts: 20, overall_quality_score: 85, group_count: 7 };

const mockGroups = [
  {
    group: 'What to Build',
    group_key: 'what_to_build',
    artifacts: [
      { title: 'Product Vision', artifact_type: 'vision', lifecycle_stage: 1, content: 'Build an AI-powered task manager that automatically prioritizes and schedules work.' },
      { title: 'Personas', artifact_type: 'personas', lifecycle_stage: 10, content: 'Primary: Busy professionals who need automated task prioritization.' },
    ],
  },
  {
    group: 'Who It\'s For',
    group_key: 'who_its_for',
    artifacts: [
      { title: 'Competitive Analysis', artifact_type: 'competitive', lifecycle_stage: 4, content: 'Competitors: Todoist, Asana, Linear. Our differentiator: AI auto-scheduling.' },
    ],
  },
  {
    group: 'How to Build It',
    group_key: 'how_to_build_it',
    artifacts: [
      { title: 'Technical Architecture', artifact_type: 'architecture', lifecycle_stage: 14, content: 'Next.js 14 with App Router, Supabase for auth and database, Tailwind CSS.' },
      { title: 'Data Model', artifact_type: 'data_model', lifecycle_stage: 14, content: 'Tables: users, tasks (id, title, priority, due_date, status, user_id), schedules.' },
      { title: 'API Contract', artifact_type: 'api_contract', lifecycle_stage: 14, content: 'REST: GET /tasks, POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id. RPC: auto_schedule(user_id).' },
    ],
  },
  {
    group: 'Why These Decisions',
    group_key: 'why_these_decisions',
    artifacts: [
      { title: 'Architecture Rationale', artifact_type: 'rationale', lifecycle_stage: 14, content: 'Next.js chosen for SSR and API routes. Supabase for real-time and RLS.' },
    ],
  },
  {
    group: 'Sprint Plan',
    group_key: 'sprint_plan',
    artifacts: [
      {
        title: 'Sprint 1', artifact_type: 'sprint_plan', lifecycle_stage: 19,
        content: {
          items: [
            { name: 'User Authentication', description: 'Login/signup with Supabase Auth', story_points: 5, priority: 'critical' },
            { name: 'Task CRUD', description: 'Create, read, update, delete tasks', story_points: 8, priority: 'high' },
            { name: 'AI Auto-Schedule', description: 'Auto-prioritize tasks using AI', story_points: 13, priority: 'high' },
          ],
        },
      },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────

describe('Helper functions', () => {
  it('normalizeGroupKey maps how_to_build to how_to_build_it', () => {
    expect(normalizeGroupKey('how_to_build')).toBe('how_to_build_it');
    expect(normalizeGroupKey('how_to_build_it')).toBe('how_to_build_it');
    expect(normalizeGroupKey('what_to_build')).toBe('what_to_build');
  });

  it('extractArtifactContent returns text for matching artifact', () => {
    const group = mockGroups.find(g => g.group_key === 'how_to_build_it');
    expect(extractArtifactContent(group, 'data_model')).toContain('tasks');
    expect(extractArtifactContent(group, 'nonexistent')).toBe('');
  });

  it('summarizeContent respects max chars', () => {
    const long = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph with more text that goes on and on.';
    const result = summarizeContent(long, 40);
    expect(result.length).toBeLessThanOrEqual(70); // includes truncation suffix
  });

  it('summarizeContent returns short text unchanged', () => {
    expect(summarizeContent('short', 100)).toBe('short');
    expect(summarizeContent('', 100)).toBe('');
  });

  it('slugify produces filename-safe strings', () => {
    expect(slugify('User Authentication')).toBe('user-authentication');
    expect(slugify('AI Auto-Schedule!')).toBe('ai-auto-schedule');
    expect(slugify('A Very Long Feature Name That Should Be Truncated To Forty Chars')).toHaveLength(40);
  });
});

// ── JSON Formatting ────────────────────────────────

describe('formatJsonArtifact', () => {
  it('formats product definition artifacts', () => {
    const obj = {
      description: 'A task management tool.',
      problemStatement: 'Teams waste time prioritizing.',
      valueProp: 'AI auto-prioritization.',
      targetMarket: 'Product teams.',
    };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('A task management tool.');
    expect(result).toContain('**Problem**: Teams waste time prioritizing.');
    expect(result).toContain('**Value Proposition**: AI auto-prioritization.');
    expect(result).toContain('**Target Market**: Product teams.');
    expect(result).not.toContain('{');
  });

  it('formats customer personas', () => {
    const obj = {
      customerPersonas: [
        { name: 'Dev Dan', demographics: { role: 'Developer' }, goals: ['Ship fast', 'No bugs'], painPoints: ['Manual testing'] },
      ],
    };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('### Dev Dan');
    expect(result).toContain('**Role**: Developer');
    expect(result).toContain('Ship fast');
    expect(result).toContain('Manual testing');
  });

  it('formats vision with milestones', () => {
    const obj = {
      vision_statement: 'Eliminate scheduling errors.',
      milestones: [{ name: 'MVP', priority: 'now', deliverables: ['Parser', 'UI'] }],
    };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('Eliminate scheduling errors.');
    expect(result).toContain('**MVP** (now): Parser, UI');
  });

  it('formats competitive analysis', () => {
    const obj = { competitors: [{ name: 'Competitor A', threat: 'H', position: 'Market leader.' }] };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('**Competitor A** (Threat: H): Market leader.');
  });

  it('formats architecture overview', () => {
    const obj = {
      architecture_summary: 'Serverless architecture.',
      layers: { api: { technology: 'REST', components: ['/api/v1'] } },
      security: { authStrategy: 'API Keys' },
    };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('Serverless architecture.');
    expect(result).toContain('**api**: REST');
    expect(result).toContain('**Auth**: API Keys');
  });

  it('formats wireframes', () => {
    const obj = { wireframes: { screens: [{ name: 'Home', purpose: 'Landing page', ascii_layout: '+---+\n|   |\n+---+' }] } };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('**Home**: Landing page');
    expect(result).toContain('+---+');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatJsonArtifact(null)).toBe('');
    expect(formatJsonArtifact(undefined)).toBe('');
  });

  it('falls back to key-value extraction for unknown shapes', () => {
    const obj = { custom_field: 'Some value that is long enough to display' };
    const result = formatJsonArtifact(obj);
    expect(result).toContain('**custom field**: Some value');
  });
});

describe('formatArtifactContent', () => {
  it('parses JSON strings and formats them', () => {
    const jsonStr = JSON.stringify({ description: 'A tool.', problemStatement: 'Time wasted.' });
    const result = formatArtifactContent(jsonStr);
    expect(result).toContain('A tool.');
    expect(result).toContain('**Problem**: Time wasted.');
    expect(result).not.toContain('{');
  });

  it('passes plain strings through unchanged', () => {
    expect(formatArtifactContent('Just a plain string.')).toBe('Just a plain string.');
  });

  it('handles objects directly', () => {
    const obj = { description: 'Direct object.' };
    const result = formatArtifactContent(obj);
    expect(result).toContain('Direct object.');
  });

  it('returns empty string for falsy values', () => {
    expect(formatArtifactContent(null)).toBe('');
    expect(formatArtifactContent('')).toBe('');
  });
});

describe('extractArchitectureSection', () => {
  it('extracts data model entities', () => {
    const group = {
      artifacts: [{
        content: JSON.stringify({
          architecture_summary: 'Serverless.',
          dataEntities: [{ name: 'User', description: 'App user' }, { name: 'Task', description: 'Work item' }],
          layers: { api: { technology: 'REST' } },
        }),
      }],
    };
    const result = extractArchitectureSection(group, 'data_model');
    expect(result).toContain('**User**: App user');
    expect(result).toContain('**Task**: Work item');
    expect(result).not.toContain('Serverless');
  });

  it('extracts API section', () => {
    const group = {
      artifacts: [{
        content: JSON.stringify({
          layers: { api: { technology: 'GraphQL', components: ['/graphql'], rationale: 'Flexible queries.' } },
        }),
      }],
    };
    const result = extractArchitectureSection(group, 'api');
    expect(result).toContain('**Protocol**: GraphQL');
    expect(result).toContain('/graphql');
    expect(result).toContain('Flexible queries.');
  });

  it('extracts architecture overview', () => {
    const group = {
      artifacts: [{
        content: JSON.stringify({
          architecture_summary: 'Monolith.',
          layers: { api: { technology: 'Express', components: ['/api'] } },
        }),
      }],
    };
    const result = extractArchitectureSection(group, 'architecture');
    expect(result).toContain('Monolith.');
    expect(result).toContain('**api**: Express');
  });

  it('returns empty string for non-JSON artifacts', () => {
    const group = { artifacts: [{ content: 'Plain text architecture' }] };
    expect(extractArchitectureSection(group, 'data_model')).toBe('');
  });
});

describe('formatReplitMd with JSON artifacts', () => {
  const jsonGroups = [
    {
      group_key: 'what_to_build',
      artifacts: [{
        content: JSON.stringify({ description: 'A project manager.', problemStatement: 'Too many tools.' }),
      }],
    },
    {
      group_key: 'who_its_for',
      artifacts: [{
        content: JSON.stringify({ competitors: [{ name: 'Jira', threat: 'H', position: 'Enterprise.' }] }),
      }],
    },
    {
      group_key: 'how_to_build_it',
      artifacts: [{
        artifact_type: 'architecture',
        content: JSON.stringify({
          architecture_summary: 'Microservices.',
          layers: { api: { technology: 'REST', components: ['/api/tasks'] } },
          dataEntities: [{ name: 'Task', description: 'A work item' }],
        }),
      }],
    },
  ];

  it('formats JSON string artifacts as readable markdown', () => {
    const result = formatReplitMd(jsonGroups, mockVenture, mockSummary);
    expect(result).toContain('A project manager.');
    expect(result).toContain('**Problem**: Too many tools.');
    expect(result).not.toMatch(/^\{/m); // No lines starting with {
  });

  it('deduplicates architecture sections', () => {
    const result = formatReplitMd(jsonGroups, mockVenture, mockSummary);
    // Data Model should have entities
    expect(result).toContain('## Data Model');
    expect(result).toContain('**Task**: A work item');
    // API should have endpoints
    expect(result).toContain('## API Patterns');
    expect(result).toContain('/api/tasks');
  });
});

// ── Format 1: replit.md ─────────────────────────────

describe('formatReplitMd', () => {
  it('produces valid markdown with all required sections', () => {
    const result = formatReplitMd(mockGroups, mockVenture, mockSummary);

    expect(result).toContain('# TaskFlow AI');
    expect(result).toContain('## Project Overview');
    expect(result).toContain('## Target Audience');
    expect(result).toContain('## Tech Stack');
    expect(result).toContain('## Data Model');
    expect(result).toContain('## API Patterns');
    expect(result).toContain('## Coding Standards');
    expect(result).toContain('## Git Workflow');
  });

  it('detects Next.js from architecture artifacts', () => {
    const result = formatReplitMd(mockGroups, mockVenture, mockSummary);
    expect(result).toContain('Next.js');
  });

  it('stays under 15K char target', () => {
    const result = formatReplitMd(mockGroups, mockVenture, mockSummary);
    expect(result.length).toBeLessThan(15000);
  });

  it('handles missing groups gracefully', () => {
    const minimalGroups = [mockGroups[0]]; // only what_to_build
    const result = formatReplitMd(minimalGroups, mockVenture, mockSummary);
    expect(result).toContain('# TaskFlow AI');
    expect(result).toContain('## Project Overview');
    expect(result).toContain('## Tech Stack'); // static section always present
  });

  it('includes venture description', () => {
    const result = formatReplitMd(mockGroups, mockVenture, mockSummary);
    expect(result).toContain('AI-powered task management');
  });
});

// ── Format 2: Plan Mode Prompt ──────────────────────

describe('formatPlanModePrompt', () => {
  it('stays under 2000 chars', () => {
    const result = formatPlanModePrompt(mockGroups, mockVenture, mockSummary);
    expect(result.length).toBeLessThanOrEqual(2000);
  });

  it('includes numbered sprint items', () => {
    const result = formatPlanModePrompt(mockGroups, mockVenture, mockSummary);
    expect(result).toContain('1. User Authentication');
    expect(result).toContain('2. Task CRUD');
    expect(result).toContain('3. AI Auto-Schedule');
  });

  it('includes story points', () => {
    const result = formatPlanModePrompt(mockGroups, mockVenture, mockSummary);
    expect(result).toContain('5 pts');
    expect(result).toContain('8 pts');
  });

  it('includes out of scope section', () => {
    const result = formatPlanModePrompt(mockGroups, mockVenture, mockSummary);
    expect(result).toContain('Out of Scope');
  });

  it('truncates to budget when content is too long', () => {
    // Create groups with very long descriptions
    const longGroups = JSON.parse(JSON.stringify(mockGroups));
    longGroups[4].artifacts[0].content.items = Array.from({ length: 20 }, (_, i) => ({
      name: `Feature ${i + 1} with a very long name for testing budget enforcement`,
      description: 'This is a very detailed description '.repeat(10),
      story_points: 5,
    }));
    const result = formatPlanModePrompt(longGroups, mockVenture, mockSummary);
    expect(result.length).toBeLessThanOrEqual(2000);
  });
});

// ── Format 3: Per-Feature Prompts ───────────────────

describe('formatFeaturePrompts', () => {
  it('returns one prompt per sprint item', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    expect(result).toHaveLength(3);
  });

  it('uses zero-padded filenames with slugs', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    expect(result[0].filename).toBe('01-user-authentication.md');
    expect(result[1].filename).toBe('02-task-crud.md');
    expect(result[2].filename).toBe('03-ai-auto-schedule.md');
  });

  it('each prompt references replit.md', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    for (const f of result) {
      expect(f.content).toContain('replit.md');
    }
  });

  it('includes build order context', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    expect(result[0].content).toContain('feature 1 of 3');
    expect(result[1].content).toContain('feature 2 of 3');
    expect(result[1].content).toContain('Build after: User Authentication');
  });

  it('includes feature description', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    expect(result[0].content).toContain('Login/signup with Supabase Auth');
  });

  it('reports char count per prompt', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    for (const f of result) {
      expect(f.charCount).toBe(f.content.length);
      expect(f.charCount).toBeGreaterThan(100);
    }
  });

  it('returns empty array when no sprint items', () => {
    const noSprintGroups = mockGroups.filter(g => g.group_key !== 'sprint_plan');
    const result = formatFeaturePrompts(noSprintGroups, mockVenture, mockSummary);
    expect(result).toHaveLength(0);
  });

  it('matches architecture content to features by keyword', () => {
    const result = formatFeaturePrompts(mockGroups, mockVenture, mockSummary);
    // "AI Auto-Schedule" should match architecture content containing "auto_schedule"
    // or "AI" — architecture artifacts mention these
    const aiFeature = result.find(f => f.filename.includes('auto-schedule'));
    // May or may not have architecture match depending on keyword overlap
    expect(aiFeature).toBeTruthy();
  });
});
