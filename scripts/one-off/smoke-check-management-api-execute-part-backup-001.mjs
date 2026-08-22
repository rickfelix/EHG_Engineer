// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-3) -- read-only smoke check proving
// SUPABASE_ACCESS_TOKEN + lib/supabase-management-api.mjs genuinely work end-to-end, BEFORE any
// real Restore-to-new-project call is attempted. Issues exactly one GET request.
//
// Usage: SUPABASE_ACCESS_TOKEN=<token> node scripts/one-off/smoke-check-management-api-execute-part-backup-001.mjs [projectRef]
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { smokeCheckProjectMetadata } from '../../lib/supabase-management-api.mjs';

export const DEFAULT_PROJECT_REF = 'dedlbzhpgkmetvhbkyzq';

async function main() {
  const projectRef = process.argv[2] || DEFAULT_PROJECT_REF;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('SUPABASE_ACCESS_TOKEN is not set -- refusing to run');
    process.exitCode = 1;
    return;
  }
  const result = await smokeCheckProjectMetadata({ projectRef, accessToken });
  if (!result.ok) {
    console.error(`Smoke check FAILED: HTTP ${result.status} (${result.error})`);
    process.exitCode = 1;
    return;
  }
  console.log('Smoke check PASS -- Management API token + wrapper work end-to-end.');
  console.log(`Project id: ${result.project.id ?? '(not present in response)'}`);
  console.log(`Project status: ${result.project.status ?? '(not present in response)'}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
