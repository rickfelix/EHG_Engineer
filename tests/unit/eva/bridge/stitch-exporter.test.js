/**
 * Unit tests for Stitch Exporter
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-C
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock stitch client
const mockStitchClient = {
  listScreens: vi.fn(),
  exportScreenHtml: vi.fn(),
  exportScreenImage: vi.fn(),
};

const {
  exportStitchArtifacts,
  injectSRIHashes,
  generateDesignMd,
  setStitchClientLoader,
  setSupabaseClientLoader,
  validateExportContent,
  isStitchExportEnabled,
  HTML_MAX_BYTES,
  PNG_MAX_BYTES,
  TOTAL_MAX_BYTES,
} = await import('../../../../lib/eva/bridge/stitch-exporter.js');

const { writeFile, mkdir } = await import('fs/promises');

// -----------------------------------------------------------------------
// Helpers for venture_artifacts persistence tests
// -----------------------------------------------------------------------

/** Build a valid PNG buffer with a given payload size (magic bytes + filler) */
function buildValidPng(payloadSize = 32) {
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const filler = Buffer.alloc(Math.max(0, payloadSize - 8), 0xff);
  return Buffer.concat([magic, filler]);
}

/** Build a chainable Supabase mock that records all operations */
function makeSupabaseMock({
  flagValue = true,           // taste_gate_config.stitch_export_enabled
  flagError = null,
  existingCurrentRow = null,  // previous is_current=true row (optional)
  selectErr = null,
  updateErr = null,
  insertErr = null,
} = {}) {
  const calls = {
    from: [],
    select: [],
    insert: [],
    update: [],
    eq: [],
  };

  const makeSelectChain = (table) => {
    const chain = {};
    chain.select = (cols) => { calls.select.push({ table, cols }); return chain; };
    chain.eq = (col, val) => { calls.eq.push({ table, col, val }); return chain; };
    chain.limit = () => chain;
    chain.single = async () => {
      if (table === 'chairman_dashboard_config') {
        if (flagError) return { data: null, error: flagError };
        return { data: { taste_gate_config: { stitch_export_enabled: flagValue } }, error: null };
      }
      return { data: null, error: null };
    };
    // Supporting awaitable without .single() (used for venture_artifacts precheck):
    chain.then = (resolve, reject) => {
      if (selectErr) return Promise.resolve({ data: null, error: selectErr }).then(resolve, reject);
      return Promise.resolve({ data: existingCurrentRow ? [existingCurrentRow] : [], error: null }).then(resolve, reject);
    };
    return chain;
  };

  const makeInsertChain = (table, row) => {
    calls.insert.push({ table, row });
    const chain = {};
    chain.select = () => chain;
    chain.single = async () => {
      if (insertErr) return { data: null, error: insertErr };
      return { data: { id: 'mock-inserted-id' }, error: null };
    };
    return chain;
  };

  const makeUpdateChain = (table, patch) => {
    const chain = { _patch: patch };
    chain.eq = (col, val) => {
      calls.update.push({ table, patch, col, val });
      return {
        then: (resolve, reject) => {
          if (updateErr) return Promise.resolve({ data: null, error: updateErr }).then(resolve, reject);
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };
    };
    return chain;
  };

  const client = {
    from: (table) => {
      calls.from.push(table);
      return {
        select: (cols) => makeSelectChain(table).select(cols),
        insert: (row) => makeInsertChain(table, row),
        update: (patch) => makeUpdateChain(table, patch),
      };
    },
  };

  return { client, calls };
}

describe('stitch-exporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStitchClientLoader(async () => mockStitchClient);
  });

  // -----------------------------------------------------------------------
  // SRI Hash Injection
  // -----------------------------------------------------------------------
  describe('injectSRIHashes', () => {
    it('adds integrity attribute to CDN script tags', () => {
      const html = '<script src="https://cdn.jsdelivr.net/npm/tailwind@3.0"></script>';
      const result = injectSRIHashes(html);

      expect(result).toContain('integrity="sha384-');
      expect(result).toContain('crossorigin="anonymous"');
    });

    it('adds integrity to Google Fonts link tags', () => {
      const html = '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">';
      const result = injectSRIHashes(html);

      expect(result).toContain('integrity="sha384-');
    });

    it('does not double-add integrity to tags that already have it', () => {
      const html = '<script src="https://cdn.jsdelivr.net/lib.js" integrity="sha384-existing"></script>';
      const result = injectSRIHashes(html);

      expect(result).toBe(html);
    });

    it('returns non-CDN HTML unchanged', () => {
      const html = '<script src="/local/script.js"></script>';
      const result = injectSRIHashes(html);

      expect(result).toBe(html);
    });

    it('handles null/undefined input', () => {
      expect(injectSRIHashes(null)).toBeNull();
      expect(injectSRIHashes(undefined)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // DESIGN.md Generation
  // -----------------------------------------------------------------------
  describe('generateDesignMd', () => {
    it('includes brand tokens and screen list', () => {
      const md = generateDesignMd(
        [{ screen_id: 's1', name: 'Home', dimensions: { w: 1920, h: 1080 } }],
        { colors: ['#FF0000'], fonts: ['Inter'], personality: 'Modern' }
      );

      expect(md).toContain('# DESIGN.md');
      expect(md).toContain('#FF0000');
      expect(md).toContain('Inter');
      expect(md).toContain('Modern');
      expect(md).toContain('Home');
      expect(md).toContain('1920x1080');
    });

    it('handles empty brand tokens', () => {
      const md = generateDesignMd([{ screen_id: 's1', name: 'Test' }], {});

      expect(md).toContain('# DESIGN.md');
      expect(md).toContain('Test');
    });
  });

  // -----------------------------------------------------------------------
  // exportStitchArtifacts
  // -----------------------------------------------------------------------
  describe('exportStitchArtifacts', () => {
    it('exports all screens as HTML and PNG with manifest', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home', dimensions: { w: 1920, h: 1080 } },
        { screen_id: 's2', name: 'About', dimensions: { w: 1920, h: 1080 } },
      ]);
      mockStitchClient.exportScreenHtml
        .mockResolvedValueOnce('<html><body>Home</body></html>')
        .mockResolvedValueOnce('<html><body>About</body></html>');
      mockStitchClient.exportScreenImage
        .mockResolvedValueOnce(Buffer.from('png-home'))
        .mockResolvedValueOnce(Buffer.from('png-about'));

      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.html_files).toHaveLength(2);
      expect(result.png_files).toHaveLength(2);
      expect(result.design_md_path).toContain('DESIGN.md');
      expect(result.manifest.screen_count).toBe(2);
      expect(result.manifest.total_files).toBe(5); // 2 HTML + 2 PNG + 1 DESIGN.md
      expect(mkdir).toHaveBeenCalledTimes(2);
      expect(writeFile).toHaveBeenCalledTimes(5);
    });

    it('returns empty manifest for project with no screens', async () => {
      mockStitchClient.listScreens.mockResolvedValue([]);

      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.manifest.screen_count).toBe(0);
      expect(result.html_files).toHaveLength(0);
      expect(result.png_files).toHaveLength(0);
      expect(result.design_md_path).toBeNull();
    });

    it('handles partial export failures gracefully', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home' },
      ]);
      mockStitchClient.exportScreenHtml.mockRejectedValue(new Error('HTML export failed'));
      mockStitchClient.exportScreenImage.mockResolvedValue(Buffer.from('png'));

      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.html_files).toHaveLength(0); // HTML failed
      expect(result.png_files).toHaveLength(1); // PNG succeeded
      expect(result.design_md_path).toContain('DESIGN.md'); // Still generated
    });

    it('injects SRI hashes into exported HTML', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home' },
      ]);
      mockStitchClient.exportScreenHtml.mockResolvedValue(
        '<html><script src="https://cdn.jsdelivr.net/lib.js"></script></html>'
      );
      mockStitchClient.exportScreenImage.mockResolvedValue(Buffer.from('png'));

      await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      const writtenHtml = writeFile.mock.calls.find(c => c[0].includes('.html'))?.[1];
      expect(writtenHtml).toContain('integrity="sha384-');
    });
  });

  // -----------------------------------------------------------------------
  // validateExportContent (SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-A US-004)
  // -----------------------------------------------------------------------
  describe('validateExportContent', () => {
    it('passes through valid files with no warnings', () => {
      const html = [{ screen_id: 's1', html: '<html><body>Hi</body></html>' }];
      const png = [{ screen_id: 's1', buffer: buildValidPng(32) }];
      const result = validateExportContent(html, png, '# DESIGN.md');

      expect(result.warnings).toHaveLength(0);
      expect(result.validHtml).toHaveLength(1);
      expect(result.validPng).toHaveLength(1);
      expect(result.totalBytes).toBeGreaterThan(0);
    });

    it('rejects PNG with invalid magic bytes', () => {
      const bad = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff]);
      const result = validateExportContent([], [{ screen_id: 's1', buffer: bad }], '');

      expect(result.validPng).toHaveLength(0);
      expect(result.warnings.some(w => w.type === 'png_invalid_magic' && w.screen_id === 's1')).toBe(true);
    });

    it('rejects HTML file exceeding 5 MB cap', () => {
      const bigHtml = 'a'.repeat(HTML_MAX_BYTES + 1);
      const result = validateExportContent(
        [{ screen_id: 's1', html: bigHtml }, { screen_id: 's2', html: '<small/>' }],
        [],
        ''
      );

      expect(result.validHtml).toHaveLength(1);
      expect(result.validHtml[0].screen_id).toBe('s2');
      expect(result.warnings.some(w => w.type === 'html_oversize' && w.screen_id === 's1')).toBe(true);
    });

    it('rejects PNG exceeding 10 MB cap', () => {
      const bigPng = buildValidPng(PNG_MAX_BYTES + 1);
      const result = validateExportContent([], [{ screen_id: 's1', buffer: bigPng }], '');

      expect(result.validPng).toHaveLength(0);
      expect(result.warnings.some(w => w.type === 'png_oversize' && w.screen_id === 's1')).toBe(true);
    });

    it('enforces total manifest cap by dropping largest files last', () => {
      // Build files that individually pass the 10 MB per-PNG cap but
      // collectively exceed the 50 MB total cap. 7 * 8 MB = 56 MB.
      const perFile = 8 * 1024 * 1024; // 8 MB each (< 10 MB per-file cap)
      const pngs = [];
      for (let i = 0; i < 7; i++) {
        pngs.push({ screen_id: `s${i}`, buffer: buildValidPng(perFile) });
      }
      const result = validateExportContent([], pngs, '');

      // 7 * 8 MB = 56 MB, cap is 50 MB — at least one must be dropped via total cap
      expect(result.validPng.length).toBeLessThan(pngs.length);
      expect(result.warnings.some(w => w.type === 'total_cap_drop')).toBe(true);
      expect(result.totalBytes).toBeLessThanOrEqual(TOTAL_MAX_BYTES);
      // No per-file oversize warnings expected
      expect(result.warnings.some(w => w.type === 'png_oversize')).toBe(false);
    });

    it('handles null/undefined inputs safely', () => {
      const result = validateExportContent(null, undefined, null);
      expect(result.validHtml).toEqual([]);
      expect(result.validPng).toEqual([]);
      expect(result.designMd).toBe('');
      expect(result.warnings).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // isStitchExportEnabled (SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-A US-002)
  // -----------------------------------------------------------------------
  describe('isStitchExportEnabled', () => {
    it('returns true when flag is strictly === true', async () => {
      const { client } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);
      await expect(isStitchExportEnabled()).resolves.toBe(true);
    });

    it('returns false when flag is false', async () => {
      const { client } = makeSupabaseMock({ flagValue: false });
      setSupabaseClientLoader(async () => client);
      await expect(isStitchExportEnabled()).resolves.toBe(false);
    });

    it('returns false when query errors', async () => {
      const { client } = makeSupabaseMock({ flagError: { message: 'connection refused' } });
      setSupabaseClientLoader(async () => client);
      await expect(isStitchExportEnabled()).resolves.toBe(false);
    });

    it('returns false when loader throws', async () => {
      setSupabaseClientLoader(async () => { throw new Error('no creds'); });
      await expect(isStitchExportEnabled()).resolves.toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // venture_artifacts persistence (SD-LEO-ORCH-STAGE-STITCH-DESIGN-001-A
  // US-003, US-005)
  // -----------------------------------------------------------------------
  describe('venture_artifacts persistence', () => {
    beforeEach(() => {
      setSupabaseClientLoader(null);
    });

    it('TS-1: happy path — exports 3 screens and inserts one row when flag is enabled', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1', name: 'Home' },
        { screen_id: 's2', name: 'About' },
        { screen_id: 's3', name: 'Contact' },
      ]);
      mockStitchClient.exportScreenHtml.mockResolvedValue('<html><body>ok</body></html>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng(512));

      const { client, calls } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.screen_count).toBe(3);
      expect(result.manifest.status).toBe('persisted');
      expect(result.manifest.venture_artifact_id).toBe('mock-inserted-id');
      expect(result.manifest.version).toBe(1);

      // Exactly one INSERT to venture_artifacts
      const vaInserts = calls.insert.filter(c => c.table === 'venture_artifacts');
      expect(vaInserts).toHaveLength(1);
      expect(vaInserts[0].row.artifact_type).toBe('stitch_design_export');
      expect(vaInserts[0].row.venture_id).toBe('v1');
      expect(vaInserts[0].row.lifecycle_stage).toBe(17);
      expect(vaInserts[0].row.is_current).toBe(true);
      expect(vaInserts[0].row.metadata.html_files).toHaveLength(3);
      expect(vaInserts[0].row.metadata.png_files_base64).toHaveLength(3);
      expect(vaInserts[0].row.metadata.png_files_base64[0]).toHaveProperty('base64');
    });

    it('TS-2: feature flag disabled returns no-op without DB write', async () => {
      mockStitchClient.listScreens.mockResolvedValue([{ screen_id: 's1' }]);
      mockStitchClient.exportScreenHtml.mockResolvedValue('<html/>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng());

      const { client, calls } = makeSupabaseMock({ flagValue: false });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.status).toBe('skipped_flag_disabled');
      expect(result.manifest.screen_count).toBe(0);
      // No venture_artifacts inserts at all
      expect(calls.insert.filter(c => c.table === 'venture_artifacts')).toHaveLength(0);
      // Adapter should not have been called either (flag gate is first)
      expect(mockStitchClient.listScreens).not.toHaveBeenCalled();
    });

    it('TS-3: invalid PNG magic bytes excluded from persisted manifest', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 's1' },
        { screen_id: 's2' },
      ]);
      mockStitchClient.exportScreenHtml.mockResolvedValue('<html/>');
      mockStitchClient.exportScreenImage
        .mockResolvedValueOnce(Buffer.from([0x00, 0x00, 0x00, 0x00, 0xaa, 0xbb, 0xcc, 0xdd])) // invalid
        .mockResolvedValueOnce(buildValidPng(256)); // valid

      const { client, calls } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.status).toBe('persisted');
      expect(result.manifest.validation_warnings.some(w => w.type === 'png_invalid_magic' && w.screen_id === 's1')).toBe(true);

      const inserted = calls.insert.find(c => c.table === 'venture_artifacts').row;
      expect(inserted.metadata.png_files_base64).toHaveLength(1);
      expect(inserted.metadata.png_files_base64[0].screen_id).toBe('s2');
    });

    it('TS-4: HTML exceeding 5MB cap is dropped from persisted manifest', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 'big' },
        { screen_id: 'small' },
      ]);
      const bigHtml = 'x'.repeat(HTML_MAX_BYTES + 10);
      mockStitchClient.exportScreenHtml
        .mockResolvedValueOnce(bigHtml)
        .mockResolvedValueOnce('<small/>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng());

      const { client, calls } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.validation_warnings.some(w => w.type === 'html_oversize' && w.screen_id === 'big')).toBe(true);
      const inserted = calls.insert.find(c => c.table === 'venture_artifacts').row;
      expect(inserted.metadata.html_files).toHaveLength(1);
      expect(inserted.metadata.html_files[0].screen_id).toBe('small');
    });

    it('TS-5: stitch-adapter listScreens failure returns degraded manifest', async () => {
      mockStitchClient.listScreens.mockRejectedValue(new Error('503 Service Unavailable'));
      const { client, calls } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.status).toBe('stitch_adapter_unavailable');
      expect(result.manifest.error_message).toContain('503');
      // No venture_artifacts insert
      expect(calls.insert.filter(c => c.table === 'venture_artifacts')).toHaveLength(0);
    });

    it('TS-6: single-screen export failure is recorded but other screens persist', async () => {
      mockStitchClient.listScreens.mockResolvedValue([
        { screen_id: 'ok1' },
        { screen_id: 'bad' },
        { screen_id: 'ok2' },
      ]);
      mockStitchClient.exportScreenHtml
        .mockResolvedValueOnce('<html/>')
        .mockRejectedValueOnce(new Error('html fetch timeout'))
        .mockResolvedValueOnce('<html/>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng(256));

      const { client, calls } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.status).toBe('persisted');
      expect(result.manifest.export_errors.some(e => e.screen_id === 'bad' && e.type === 'html')).toBe(true);

      const inserted = calls.insert.find(c => c.table === 'venture_artifacts').row;
      // 2 HTML successfully exported
      expect(inserted.metadata.html_files).toHaveLength(2);
      // All 3 PNGs succeeded (PNG mock returns success for all calls)
      expect(inserted.metadata.png_files_base64).toHaveLength(3);
    });

    it('TS-7: backward compat — filesystem-only path does not touch Supabase', async () => {
      mockStitchClient.listScreens.mockResolvedValue([{ screen_id: 's1' }]);
      mockStitchClient.exportScreenHtml.mockResolvedValue('<html/>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng());

      const { client, calls } = makeSupabaseMock({ flagValue: true });
      setSupabaseClientLoader(async () => client);

      // No persistTo option (default = 'filesystem')
      const result = await exportStitchArtifacts('v1', 'proj-1', '/tmp/out');

      expect(result.html_files).toHaveLength(1);
      expect(result.png_files).toHaveLength(1);
      expect(result.design_md_path).toContain('DESIGN.md');
      // No Supabase activity at all
      expect(calls.from).toHaveLength(0);
      expect(calls.insert).toHaveLength(0);
      // No status set (legacy behavior preserved)
      expect(result.manifest.status).toBeUndefined();
    });

    it('persistence_failed status when Supabase insert errors', async () => {
      mockStitchClient.listScreens.mockResolvedValue([{ screen_id: 's1' }]);
      mockStitchClient.exportScreenHtml.mockResolvedValue('<html/>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng());

      const { client } = makeSupabaseMock({
        flagValue: true,
        insertErr: { message: 'CHECK constraint violation' },
      });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.status).toBe('persistence_failed');
      expect(result.manifest.error_message).toContain('CHECK constraint');
      // Function did NOT throw
    });

    it('idempotency — flips existing current row before inserting new row', async () => {
      mockStitchClient.listScreens.mockResolvedValue([{ screen_id: 's1' }]);
      mockStitchClient.exportScreenHtml.mockResolvedValue('<html/>');
      mockStitchClient.exportScreenImage.mockResolvedValue(buildValidPng());

      const { client, calls } = makeSupabaseMock({
        flagValue: true,
        existingCurrentRow: { id: 'old-row-id', version: 3 },
      });
      setSupabaseClientLoader(async () => client);

      const result = await exportStitchArtifacts('v1', 'proj-1', null, { persistTo: 'venture_artifacts' });

      expect(result.manifest.status).toBe('persisted');
      expect(result.manifest.version).toBe(4); // incremented from 3

      // Update must have been called to flip is_current=false on old row
      const flipCall = calls.update.find(u => u.table === 'venture_artifacts' && u.patch?.is_current === false);
      expect(flipCall).toBeDefined();
      expect(flipCall.val).toBe('old-row-id');

      // Insert has version=4
      const inserted = calls.insert.find(c => c.table === 'venture_artifacts').row;
      expect(inserted.version).toBe(4);
      expect(inserted.is_current).toBe(true);
    });
  });
});
