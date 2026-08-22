// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-3): Management API wrapper.
import { describe, it, expect } from 'vitest';
import { buildGetProjectRequest, smokeCheckProjectMetadata, MANAGEMENT_API_BASE } from '../../lib/supabase-management-api.mjs';

describe('buildGetProjectRequest (FR-3)', () => {
  it('builds a GET request to the project metadata endpoint with a Bearer token', () => {
    const { url, options } = buildGetProjectRequest('dedlbzhpgkmetvhbkyzq', 'test-token');
    expect(url).toBe(`${MANAGEMENT_API_BASE}/projects/dedlbzhpgkmetvhbkyzq`);
    expect(options.method).toBe('GET');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });

  it('throws on a missing projectRef or accessToken rather than silently building a broken request', () => {
    expect(() => buildGetProjectRequest(null, 'token')).toThrow();
    expect(() => buildGetProjectRequest('ref', null)).toThrow();
  });
});

describe('smokeCheckProjectMetadata (FR-3): zero non-GET calls', () => {
  it('issues exactly one GET call and returns the parsed project metadata on success', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ id: 'dedlbzhpgkmetvhbkyzq', status: 'ACTIVE_HEALTHY' }) };
    };
    const result = await smokeCheckProjectMetadata({ projectRef: 'dedlbzhpgkmetvhbkyzq', accessToken: 'test-token', fetchImpl });
    expect(calls).toHaveLength(1);
    expect(calls[0].options.method).toBe('GET');
    expect(result.ok).toBe(true);
    expect(result.project.id).toBe('dedlbzhpgkmetvhbkyzq');
  });

  it('reports a non-ok HTTP response without throwing (caller decides how to handle)', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const result = await smokeCheckProjectMetadata({ projectRef: 'ref', accessToken: 'bad-token', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.project).toBeNull();
  });

  it('never issues a non-GET call even if fetchImpl would accept one -- the mock itself asserts method on every invocation', async () => {
    const fetchImpl = async (_url, options) => {
      if (options.method !== 'GET') {
        throw new Error(`SAFETY TEST FAILURE: non-GET call attempted: ${options.method}`);
      }
      return { ok: true, status: 200, json: async () => ({}) };
    };
    await expect(smokeCheckProjectMetadata({ projectRef: 'ref', accessToken: 'token', fetchImpl })).resolves.toMatchObject({ ok: true });
  });
});
