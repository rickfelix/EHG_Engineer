// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-3) -- minimal Supabase Management API wrapper.
// No such wrapper existed anywhere in this repo prior to this SD (LEAD-phase Explore evidence:
// zero hits for api.supabase.com; SUPABASE_ACCESS_TOKEN was only ever consumed by the `supabase`
// CLI, never as a raw Bearer HTTP call). Built from scratch, deliberately minimal: only the calls
// this SD's first consumer (a dry, read-only smoke check) actually needs. Restore-to-new-project
// consumption is a documented, disclosed follow-up once the backup-entitlement question (signal
// 6ec46db8-37ca-4da4-9119-5e2a6b6482f1) is resolved -- this module does not implement it yet.

export const MANAGEMENT_API_BASE = 'https://api.supabase.com/v1';

/**
 * Build the request the smoke-check needs: a read-only GET of project metadata.
 * Pure -- no network I/O, no fetch call. Callers (or tests) supply their own fetch.
 * @param {string} projectRef
 * @param {string} accessToken
 * @returns {{url: string, options: {method: 'GET', headers: object}}}
 */
export function buildGetProjectRequest(projectRef, accessToken) {
  if (!projectRef) throw new Error('projectRef is required');
  if (!accessToken) throw new Error('accessToken is required');
  return {
    url: `${MANAGEMENT_API_BASE}/projects/${projectRef}`,
    options: {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  };
}

/**
 * Read-only smoke check: fetch project metadata to prove the token/wrapper genuinely work.
 * Issues exactly ONE GET request -- never a POST/PUT/DELETE, and never the restore-to-new-project
 * endpoint. `fetchImpl` is injectable so tests never make a real network call.
 * @param {{projectRef: string, accessToken: string, fetchImpl?: typeof fetch}} params
 * @returns {Promise<{ok: boolean, status: number, project: object|null, error: string|null}>}
 */
export async function smokeCheckProjectMetadata({ projectRef, accessToken, fetchImpl = fetch }) {
  const { url, options } = buildGetProjectRequest(projectRef, accessToken);
  if (options.method !== 'GET') {
    // Defensive: this function must never issue anything but a GET. If buildGetProjectRequest
    // is ever changed to return a different method, fail loudly instead of silently escalating.
    throw new Error(`SAFETY: smoke check built a non-GET request (${options.method}) -- refusing to send`);
  }
  const response = await fetchImpl(url, options);
  if (!response.ok) {
    return { ok: false, status: response.status, project: null, error: `HTTP ${response.status}` };
  }
  const project = await response.json();
  return { ok: true, status: response.status, project, error: null };
}
