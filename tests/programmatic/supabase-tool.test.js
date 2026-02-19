/**
 * Unit tests for lib/programmatic/tools/supabase-tool.js
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 */

import { describe, it, expect, vi } from 'vitest';
import { createSupabaseTool, createSupabaseUpsertTool } from '../../lib/programmatic/tools/supabase-tool.js';

function buildMockSupabase(resolvedData = [], resolvedError = null) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
    select: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
  };
  return {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query), upsert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }) }) }),
  };
}

describe('createSupabaseTool', () => {
  it('has correct tool definition name', () => {
    const { definition } = createSupabaseTool({});
    expect(definition.name).toBe('supabase_query');
    expect(definition.input_schema.required).toContain('table');
    expect(definition.input_schema.required).toContain('select');
  });

  it('returns dry_run message in dry run mode', async () => {
    const { handler } = createSupabaseTool({});
    const result = await handler({ table: 'test', select: '*' }, { dryRun: true });
    const parsed = JSON.parse(result);
    expect(parsed.dry_run).toBe(true);
  });

  it('queries supabase and returns JSON rows', async () => {
    const mockRows = [{ id: '1', title: 'Test SD' }];
    const supabase = buildMockSupabase(mockRows);
    const { handler } = createSupabaseTool(supabase);

    const result = await handler({ table: 'strategic_directives_v2', select: 'id,title' });
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('applies eq filter', async () => {
    const supabase = buildMockSupabase([]);
    const { handler } = createSupabaseTool(supabase);
    await handler({
      table: 'test',
      select: '*',
      filters: [{ col: 'sd_key', op: 'eq', val: 'SD-001' }],
    });
    // just verify it runs without error
    expect(supabase.from).toHaveBeenCalledWith('test');
  });

  it('returns error JSON on supabase failure', async () => {
    const supabase = buildMockSupabase(null, { message: 'relation not found' });
    const { handler } = createSupabaseTool(supabase);
    const result = await handler({ table: 'nonexistent', select: '*' });
    const parsed = JSON.parse(result);
    expect(parsed.error).toContain('relation not found');
  });
});

describe('createSupabaseUpsertTool', () => {
  it('has correct tool definition name', () => {
    const { definition } = createSupabaseUpsertTool({});
    expect(definition.name).toBe('supabase_upsert');
  });

  it('returns dry_run message in dry run mode', async () => {
    const { handler } = createSupabaseUpsertTool({});
    const result = await handler({ table: 'test', data: { id: '1' } }, { dryRun: true });
    const parsed = JSON.parse(result);
    expect(parsed.dry_run).toBe(true);
  });
});
