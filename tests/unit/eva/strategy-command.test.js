import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock Supabase factory
// ============================================================================

function createMockSupabase() {
  let queryResult = { data: null, error: null };

  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn(() => Promise.resolve(queryResult)),
    maybeSingle: vi.fn(() => Promise.resolve(queryResult)),
    then: vi.fn((cb) => Promise.resolve(queryResult).then(cb)),
    setResult(data, error = null) {
      queryResult = { data, error };
      return this;
    }
  };

  const supabase = {
    from: vi.fn(() => chainable),
    _chain: chainable,
    _setResult(data, error) {
      chainable.setResult(data, error);
      return supabase;
    }
  };

  return supabase;
}

// ============================================================================
// Inline function definitions (avoid ESM import side-effects)
// ============================================================================

function parseArgs(argv) {
  const args = argv.slice(2);
  const subcommand = args[0];
  const opts = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    } else {
      positional.push(args[i]);
    }
  }
  return { subcommand, opts, positional };
}

const STATUS_ICONS = { draft: '\uD83D\uDCDD', active: '\u2705', archived: '\uD83D\uDCE6' };

// ============================================================================
// parseArgs tests
// ============================================================================

describe('strategy-command', () => {
  describe('parseArgs', () => {
    it('extracts subcommand from first positional arg', () => {
      const result = parseArgs(['node', 'script', 'view']);
      expect(result.subcommand).toBe('view');
    });

    it('parses --year flag as string value', () => {
      const result = parseArgs(['node', 'script', 'derive', '--year', '2026']);
      expect(result.opts.year).toBe('2026');
    });

    it('parses --vision-key as camelCase visionKey', () => {
      const result = parseArgs(['node', 'script', 'derive', '--vision-key', 'VISION-EHG-L1-001']);
      expect(result.opts.visionKey).toBe('VISION-EHG-L1-001');
    });

    it('captures positional arguments after subcommand', () => {
      const result = parseArgs(['node', 'script', 'detail', 'THEME-2026-001']);
      expect(result.positional).toEqual(['THEME-2026-001']);
    });

    it('handles flag without value as boolean true', () => {
      const result = parseArgs(['node', 'script', 'view', '--verbose']);
      expect(result.opts.verbose).toBe(true);
    });

    it('returns undefined subcommand when no args', () => {
      const result = parseArgs(['node', 'script']);
      expect(result.subcommand).toBeUndefined();
    });
  });

  // ============================================================================
  // cmdView tests
  // ============================================================================

  describe('cmdView', () => {
    let supabase;
    let consoleSpy;

    beforeEach(() => {
      supabase = createMockSupabase();
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('displays all strategic themes with status icons', async () => {
      const themes = [
        { theme_key: 'THEME-2026-001', title: 'AI-First Operations', year: 2026, status: 'active', derived_from_vision: true, vision_key: 'VISION-EHG-L1-001' },
        { theme_key: 'THEME-2026-002', title: 'Market Expansion', year: 2026, status: 'draft', derived_from_vision: false, vision_key: null }
      ];

      supabase._chain.order = vi.fn(() => ({
        ...supabase._chain,
        then: (cb) => Promise.resolve({ data: themes, error: null }).then(cb)
      }));

      await cmdView(supabase);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('STRATEGIC THEMES');
      expect(output).toContain('2 theme(s)');
      expect(output).toContain('AI-First Operations');
      expect(output).toContain('derived from VISION-EHG-L1-001');
      expect(output).toContain('manual');
    });

    it('displays message when no themes found', async () => {
      supabase._chain.order = vi.fn(() => ({
        ...supabase._chain,
        then: (cb) => Promise.resolve({ data: [], error: null }).then(cb)
      }));

      await cmdView(supabase);

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No strategic themes found');
    });
  });

  // ============================================================================
  // cmdDetail tests
  // ============================================================================

  describe('cmdDetail', () => {
    let supabase;
    let consoleSpy;

    beforeEach(() => {
      supabase = createMockSupabase();
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('displays full theme detail by theme_key', async () => {
      const theme = {
        theme_key: 'THEME-2026-001',
        title: 'AI-First Operations',
        description: 'Transform all operations to be AI-first',
        year: 2026,
        status: 'active',
        derived_from_vision: true,
        vision_key: 'VISION-EHG-L1-001',
        source_dimensions: [{ name: 'ai_automation', weight: 0.8 }],
        created_at: '2026-01-15T00:00:00Z',
        created_by: 'eva-derive',
        id: 'uuid-123'
      };

      supabase._chain.setResult(theme);

      await cmdDetail(supabase, 'THEME-2026-001');

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('THEME-2026-001');
      expect(output).toContain('AI-First Operations');
      expect(output).toContain('Derived from vision');
      expect(output).toContain('ai_automation');
      expect(output).toContain('weight: 0.8');
    });

    it('falls back to title match when theme_key not found', async () => {
      let callCount = 0;
      supabase.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First query by theme_key fails
          supabase._chain.setResult(null, { message: 'not found' });
        } else {
          // Fallback title search succeeds
          supabase._chain.setResult({
            theme_key: 'THEME-2026-003',
            title: 'Customer Focus',
            year: 2026,
            status: 'draft',
            derived_from_vision: false,
            source_dimensions: null,
            created_at: '2026-01-01T00:00:00Z',
            created_by: 'chairman',
            id: 'uuid-456'
          });
        }
        return supabase._chain;
      });

      await cmdDetail(supabase, 'Customer');

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('Customer Focus');
    });

    it('exits with error when no identifier provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(cmdDetail(supabase, null)).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('theme key or ID required'));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('handles theme not found by key or title', async () => {
      let callCount = 0;
      supabase.from = vi.fn(() => {
        callCount++;
        supabase._chain.setResult(null, callCount === 1 ? { message: 'not found' } : null);
        return supabase._chain;
      });

      await cmdDetail(supabase, 'NONEXISTENT');

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('not found');
    });
  });

  // ============================================================================
  // cmdDerive tests
  // ============================================================================

  describe('cmdDerive', () => {
    let supabase;
    let consoleSpy;

    beforeEach(() => {
      supabase = createMockSupabase();
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('creates themes from vision document dimensions', async () => {
      let callCount = 0;
      supabase.from = vi.fn((table) => {
        callCount++;
        if (table === 'eva_vision_documents') {
          supabase._chain.setResult(null); // for .eq().then() pattern
          supabase._chain.then = vi.fn((cb) => Promise.resolve({
            data: [{
              vision_key: 'VISION-EHG-L1-001',
              level: 'L1',
              content: 'Vision content',
              extracted_dimensions: [
                { key: 'ai_automation', weight: 0.8, description: 'AI-first ops' },
                { key: 'market_expansion', weight: 0.6, description: 'New markets' }
              ],
              status: 'active'
            }],
            error: null
          }).then(cb));
        } else if (table === 'strategic_themes') {
          // Max existing, existing check, then inserts
          if (callCount <= 3) {
            supabase._chain.setResult(null);
            supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
          } else {
            supabase._chain.setResult({ theme_key: `THEME-2026-00${callCount - 3}`, title: 'Test' });
          }
        }
        return supabase._chain;
      });

      await cmdDerive(supabase, { year: '2026' });

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('DERIVING STRATEGIC THEMES FROM VISION');
      expect(output).toContain('Year: 2026');
    });

    it('skips dimensions already derived', async () => {
      let callCount = 0;
      supabase.from = vi.fn((table) => {
        callCount++;
        if (table === 'eva_vision_documents') {
          supabase._chain.then = vi.fn((cb) => Promise.resolve({
            data: [{
              vision_key: 'VISION-EHG-L1-001',
              extracted_dimensions: [{ key: 'existing_dim', weight: 0.5 }],
              status: 'active'
            }],
            error: null
          }).then(cb));
        } else if (table === 'strategic_themes') {
          if (callCount === 2) {
            // Max existing
            supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
          } else {
            // Existing themes check - return theme with existing dim
            supabase._chain.then = vi.fn((cb) => Promise.resolve({
              data: [{ source_dimensions: [{ key: 'existing_dim' }] }],
              error: null
            }).then(cb));
          }
        }
        return supabase._chain;
      });

      await cmdDerive(supabase, {});

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('already derived');
    });

    it('warns when vision doc has no dimensions', async () => {
      supabase.from = vi.fn((table) => {
        if (table === 'eva_vision_documents') {
          supabase._chain.then = vi.fn((cb) => Promise.resolve({
            data: [{
              vision_key: 'VISION-EMPTY',
              extracted_dimensions: [],
              status: 'active'
            }],
            error: null
          }).then(cb));
        } else {
          supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
        }
        return supabase._chain;
      });

      await cmdDerive(supabase, {});

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No extracted dimensions');
    });

    it('defaults year to current year when not specified', async () => {
      supabase.from = vi.fn(() => {
        supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
        return supabase._chain;
      });

      await cmdDerive(supabase, {});

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain(`Year: ${new Date().getFullYear()}`);
    });

    it('displays message when no vision documents found', async () => {
      supabase.from = vi.fn(() => {
        supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
        return supabase._chain;
      });

      await cmdDerive(supabase, {});

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('No active vision documents found');
    });
  });

  // ============================================================================
  // cmdCreate tests
  // ============================================================================

  describe('cmdCreate', () => {
    let supabase;
    let consoleSpy;

    beforeEach(() => {
      supabase = createMockSupabase();
      consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('creates theme with generated key', async () => {
      let callCount = 0;
      supabase.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // Get max existing
          supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
        } else {
          supabase._chain.setResult({ theme_key: 'THEME-2026-001', title: 'New Theme', year: 2026, status: 'draft' });
        }
        return supabase._chain;
      });

      await cmdCreate(supabase, { title: 'New Theme', year: '2026' });

      const output = consoleSpy.mock.calls.map(c => c[0]).join('\n');
      expect(output).toContain('STRATEGIC THEME CREATED');
      expect(output).toContain('THEME-2026-001');
    });

    it('exits when --title not provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(cmdCreate(supabase, { year: '2026' })).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--title'));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('exits when --year not provided', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(cmdCreate(supabase, { title: 'Test' })).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--year'));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('increments theme index from existing themes', async () => {
      let callCount = 0;
      supabase.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          supabase._chain.then = vi.fn((cb) => Promise.resolve({
            data: [{ theme_key: 'THEME-2026-005' }],
            error: null
          }).then(cb));
        } else {
          supabase._chain.setResult({ theme_key: 'THEME-2026-006', title: 'Test', year: 2026, status: 'draft' });
        }
        return supabase._chain;
      });

      await cmdCreate(supabase, { title: 'Test', year: '2026' });

      expect(supabase._chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ theme_key: 'THEME-2026-006' })
      );
    });

    it('handles insert error', async () => {
      let callCount = 0;
      supabase.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
        } else {
          supabase._chain.setResult(null, { message: 'duplicate key' });
        }
        return supabase._chain;
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(cmdCreate(supabase, { title: 'Dup', year: '2026' })).rejects.toThrow('exit');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate key'));

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('uppercases vision-key when provided', async () => {
      let callCount = 0;
      supabase.from = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          supabase._chain.then = vi.fn((cb) => Promise.resolve({ data: [], error: null }).then(cb));
        } else {
          supabase._chain.setResult({ theme_key: 'THEME-2026-001', title: 'Test', year: 2026, status: 'draft' });
        }
        return supabase._chain;
      });

      await cmdCreate(supabase, { title: 'Test', year: '2026', visionKey: 'vision-ehg-l1-001' });

      expect(supabase._chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ vision_key: 'VISION-EHG-L1-001' })
      );
    });
  });
});

// ============================================================================
// Inline function implementations (avoid ESM side-effects)
// ============================================================================

async function cmdView(supabase) {
  const { data, error } = await supabase
    .from('strategic_themes')
    .select('theme_key, title, year, status, derived_from_vision, vision_key')
    .order('year', { ascending: false });

  if (error || !data || data.length === 0) {
    console.log('\n  No strategic themes found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  STRATEGIC THEMES');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  ${data.length} theme(s) loaded`);

  for (const t of data) {
    const icon = STATUS_ICONS[t.status] || '\uD83D\uDCCC';
    const source = t.derived_from_vision ? `derived from ${t.vision_key}` : 'manual';
    console.log('');
    console.log(`  ${icon} ${t.theme_key} [${t.year}] [${t.status.toUpperCase()}]`);
    console.log(`     ${t.title}`);
    console.log(`     Source: ${source}`);
  }
  console.log('');
}

async function cmdDetail(supabase, identifier) {
  if (!identifier) {
    console.error('Error: theme key or ID required (e.g., THEME-2026-001)');
    process.exit(1);
  }

  let query = supabase
    .from('strategic_themes')
    .select('*')
    .eq('theme_key', identifier.toUpperCase());

  let { data, error } = await query.single();

  if (error || !data) {
    const { data: titleMatch } = await supabase
      .from('strategic_themes')
      .select('*')
      .ilike('title', `%${identifier}%`)
      .limit(1)
      .single();

    if (!titleMatch) {
      console.log(`\n  Theme "${identifier}" not found.\n`);
      return;
    }
    data = titleMatch;
  }

  const icon = STATUS_ICONS[data.status] || '\uD83D\uDCCC';

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  ${icon} ${data.theme_key} [${data.year}] [${data.status.toUpperCase()}]`);
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Title: ${data.title}`);
  console.log('');
  if (data.description) {
    console.log('  Description:');
    console.log(`  ${data.description}`);
    console.log('');
  }
  console.log(`  Source:  ${data.derived_from_vision ? 'Derived from vision' : 'Manual entry'}`);
  if (data.vision_key) {
    console.log(`  Vision:  ${data.vision_key}`);
  }
  if (data.source_dimensions && Array.isArray(data.source_dimensions) && data.source_dimensions.length > 0) {
    console.log('  Dimensions:');
    for (const dim of data.source_dimensions) {
      console.log(`    - ${dim.name || dim.key} (weight: ${dim.weight || 'N/A'})`);
    }
  }
  console.log('');
  console.log(`  Created: ${new Date(data.created_at).toLocaleDateString()}`);
  console.log(`  By:      ${data.created_by}`);
  console.log(`  ID:      ${data.id}`);
  console.log('');
}

async function cmdDerive(supabase, opts) {
  const year = parseInt(opts.year) || new Date().getFullYear();
  const visionKeyFilter = opts.visionKey;

  let query = supabase
    .from('eva_vision_documents')
    .select('vision_key, level, content, extracted_dimensions, status')
    .eq('status', 'active');

  if (visionKeyFilter) {
    query = query.eq('vision_key', visionKeyFilter.toUpperCase());
  }

  const { data: visionDocs, error: fetchErr } = await query;

  if (fetchErr || !visionDocs || visionDocs.length === 0) {
    console.log('\n  No active vision documents found.\n');
    return;
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  DERIVING STRATEGIC THEMES FROM VISION');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log(`  Year: ${year}`);
  console.log(`  Vision documents: ${visionDocs.length}`);

  const { data: maxExisting } = await supabase
    .from('strategic_themes')
    .select('theme_key')
    .eq('year', year)
    .order('theme_key', { ascending: false })
    .limit(1);

  let nextIndex = 1;
  if (maxExisting && maxExisting.length > 0) {
    const match = maxExisting[0].theme_key.match(/THEME-\d+-(\d+)/);
    if (match) nextIndex = parseInt(match[1]) + 1;
  }

  let totalCreated = 0;

  for (const doc of visionDocs) {
    const dims = doc.extracted_dimensions;
    if (!dims || !Array.isArray(dims) || dims.length === 0) {
      console.log(`\n  \u26A0\uFE0F  ${doc.vision_key}: No extracted dimensions, skipping`);
      continue;
    }

    console.log(`\n  Processing ${doc.vision_key} (${dims.length} dimensions)...`);

    const { data: existing } = await supabase
      .from('strategic_themes')
      .select('source_dimensions')
      .eq('vision_key', doc.vision_key)
      .eq('year', year);

    const existingKeys = new Set();
    if (existing) {
      for (const e of existing) {
        if (e.source_dimensions && Array.isArray(e.source_dimensions)) {
          for (const d of e.source_dimensions) {
            existingKeys.add(d.key || d.name);
          }
        }
      }
    }

    const sorted = [...dims].sort((a, b) => (b.weight || 0) - (a.weight || 0));

    for (const dim of sorted) {
      const dimKey = dim.key || dim.name;

      if (existingKeys.has(dimKey)) {
        console.log(`     \u23ED\uFE0F  ${dimKey}: already derived, skipping`);
        continue;
      }

      const themeKey = `THEME-${year}-${String(nextIndex).padStart(3, '0')}`;
      const title = dimKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      const { data: inserted, error: insertErr } = await supabase
        .from('strategic_themes')
        .insert({
          theme_key: themeKey,
          title,
          description: dim.description || `Derived from ${doc.vision_key} dimension: ${dimKey}`,
          year,
          status: 'draft',
          vision_key: doc.vision_key,
          derived_from_vision: true,
          source_dimensions: [dim],
          created_by: 'eva-derive'
        })
        .select('theme_key, title')
        .single();

      if (insertErr) {
        console.log(`     \u274C ${themeKey}: ${insertErr.message}`);
        continue;
      }

      console.log(`     \u2705 ${inserted.theme_key}: ${inserted.title} (weight: ${dim.weight || 'N/A'})`);
      totalCreated++;
      nextIndex++;
    }
  }

  console.log('');
  console.log('  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
  console.log(`  Created ${totalCreated} theme(s) for ${year}`);
  if (totalCreated > 0) {
    console.log('  Status: draft (activate via DB or future activate subcommand)');
  }
  console.log('');
}

async function cmdCreate(supabase, opts) {
  const title = opts.title;
  const year = parseInt(opts.year);
  const description = opts.description;

  if (!title || title === true) {
    console.error('Error: --title <title> is required');
    process.exit(1);
  }
  if (!year || isNaN(year)) {
    console.error('Error: --year <year> is required (e.g., 2026)');
    process.exit(1);
  }

  const { data: existing } = await supabase
    .from('strategic_themes')
    .select('theme_key')
    .eq('year', year)
    .order('theme_key', { ascending: false })
    .limit(1);

  let nextIndex = 1;
  if (existing && existing.length > 0) {
    const match = existing[0].theme_key.match(/THEME-\d+-(\d+)/);
    if (match) nextIndex = parseInt(match[1]) + 1;
  }

  const themeKey = `THEME-${year}-${String(nextIndex).padStart(3, '0')}`;

  const insertData = {
    theme_key: themeKey,
    title,
    year,
    status: 'draft',
    derived_from_vision: false,
    created_by: 'chairman'
  };

  if (description && description !== true) insertData.description = description;
  if (opts.visionKey && opts.visionKey !== true) {
    insertData.vision_key = opts.visionKey.toUpperCase();
  }

  const { data: theme, error: insertErr } = await supabase
    .from('strategic_themes')
    .insert(insertData)
    .select('theme_key, title, year, status')
    .single();

  if (insertErr) {
    console.error(`Error creating theme: ${insertErr.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('  STRATEGIC THEME CREATED');
  console.log('  ═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Key:    ${theme.theme_key}`);
  console.log(`  Title:  ${theme.title}`);
  console.log(`  Year:   ${theme.year}`);
  console.log(`  Status: ${theme.status}`);
  console.log('');
}

const STATUS_ICONS_TEST = { draft: '\uD83D\uDCDD', active: '\u2705', archived: '\uD83D\uDCE6' };
