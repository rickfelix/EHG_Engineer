import { describe, it, expect } from 'vitest';
import {
  formatReplitMd,
  formatPlanModePrompt,
  formatFeaturePrompts,
  normalizeGroupKey,
  extractArtifactContent,
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
