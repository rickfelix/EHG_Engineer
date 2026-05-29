/**
 * Regression: leo_sub_agents queries must filter on the live column `active`, not `is_active`.
 *
 * QF-20260529-822 / RCA d276bbf3: lib/agent-experience-factory/adapters/skills-adapter.js
 * filtered `.eq('is_active', true)` and threw "leo_sub_agents query failed: column
 * leo_sub_agents.is_active does not exist", which add-prd-to-database.js DESIGN orchestration
 * surfaced -> DESIGN scored 0/100. scripts/claude-gen/data-fetchers.js getSubAgents() did the
 * same and silently returned [] (dropping every sub-agent from the generated CLAUDE.md).
 * The live leo_sub_agents column is `active` (6 other call sites already use it).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const skillsPath = fileURLToPath(
  new URL('../../lib/agent-experience-factory/adapters/skills-adapter.js', import.meta.url)
);
const fetchersPath = fileURLToPath(new URL('../../scripts/claude-gen/data-fetchers.js', import.meta.url));

describe('leo_sub_agents queries use the live `active` column (QF-20260529-822)', () => {
  const skillsSrc = readFileSync(skillsPath, 'utf8');
  const fetchersSrc = readFileSync(fetchersPath, 'utf8');

  it('skills-adapter queries leo_sub_agents with .eq("active") and never is_active', () => {
    expect(skillsSrc).toMatch(/\.from\('leo_sub_agents'\)[\s\S]{0,400}\.eq\('active',\s*true\)/);
    expect(skillsSrc).not.toMatch(/\.eq\('is_active'/);
  });

  it('data-fetchers getSubAgents queries leo_sub_agents with active, not is_active', () => {
    // Scope to the leo_sub_agents block (the file legitimately uses is_active on OTHER tables).
    expect(fetchersSrc).toMatch(/\.from\('leo_sub_agents'\)[\s\S]{0,400}\.eq\('active',\s*true\)/);
    expect(fetchersSrc).not.toMatch(/\.from\('leo_sub_agents'\)[\s\S]{0,400}\.eq\('is_active'/);
  });
});

// Behavioral: the SkillsAdapter query must run against the live schema without throwing.
// DB-gated: skips cleanly without service-role creds (e.g. CI without secrets).
const hasCreds = !!(
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
);

describe.skipIf(!hasCreds)('SkillsAdapter — runs against live leo_sub_agents schema', () => {
  let SkillsAdapter, supabase;

  beforeAll(async () => {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    ({ SkillsAdapter } = await import('../../lib/agent-experience-factory/adapters/skills-adapter.js'));
  });

  it('_doFetch does not throw on the leo_sub_agents query (pre-fix: is_active threw)', async () => {
    const adapter = new SkillsAdapter(supabase);
    const result = await adapter._doFetch({ domain: 'testing', category: 'quality' });
    expect(result).toBeTruthy();
    expect(Array.isArray(result.items)).toBe(true);
  });
});
