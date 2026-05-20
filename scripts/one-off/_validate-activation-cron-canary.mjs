// Read-only activation validation (no prod change). Sets the flag locally only.
// Confirms whether the live Cron Canary venture + the 3 archetype fixtures resolve
// to >=1 marketing surface and 0 null through the real onBeforeAnalysis ->
// resolveMarketingWireframe path. Diagnoses the screen_name vs name fallback gap.
process.env.EVA_SURFACE_AWARE_ENABLED = 'true';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import TEMPLATE from '../../lib/eva/stage-templates/stage-18.js';
import { resolveMarketingWireframe } from '../../lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js';
import { classifySurface } from '../../lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const CRON_CANARY = '09b7037e-cf6e-4057-9143-910c25c70788';

// Surface as resolveMarketingWireframe currently sees it (classifySurface reads .name only)
const surfaceCurrent = (s) => s.surface ?? classifySurface(s).surface ?? null;
// Surface with a screen_name-aware fallback (the candidate fix)
const surfaceFixed = (s) => s.surface ?? classifySurface({ name: s.screen_name ?? s.name ?? s.title ?? '' }).surface ?? null;

function tally(screens, fn) {
  const t = { marketing: 0, auth: 0, app: 0, null: 0 };
  for (const s of screens) { const v = fn(s); t[v ?? 'null'] = (t[v ?? 'null'] || 0) + 1; }
  return t;
}

(async () => {
  console.log('=== ACTIVATION VALIDATION (flag=true, READ-ONLY) ===\n');

  // 1. Cron Canary live venture
  console.log('--- Cron Canary venture ' + CRON_CANARY + ' ---');
  const { data: art } = await supabase
    .from('venture_artifacts')
    .select('id, created_at, artifact_data')
    .eq('venture_id', CRON_CANARY)
    .eq('lifecycle_stage', 15)
    .eq('artifact_type', 'wireframe_screens')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!art) {
    console.log('  NO wireframe_screens artifact for Cron Canary (venture has not run S15 with the artifact mechanism).');
  } else {
    const screens = art.artifact_data?.screens || [];
    console.log('  artifact id=' + art.id + ' created=' + art.created_at + ' screens=' + screens.length);
    console.log('  screen names + raw surface:');
    screens.forEach(s => console.log('    - "' + (s.screen_name ?? s.name ?? '(unnamed)') + '" surface=' + (s.surface ?? '(none)')));
    const ctx = await TEMPLATE.onBeforeAnalysis(supabase, CRON_CANARY);
    const fed = ctx.stage15WireframeData ? (ctx.stage15WireframeData.screens || ctx.stage15WireframeData) : [];
    const mwCurrent = resolveMarketingWireframe(ctx.stage15WireframeData ?? null);
    console.log('  onBeforeAnalysis fed stage15WireframeData: ' + (ctx.stage15WireframeData ? 'YES (' + fed.length + ' screens)' : 'NO'));
    console.log('  CURRENT  surface tally (classifySurface reads .name): ' + JSON.stringify(tally(screens, surfaceCurrent)) + ' | resolveMarketingWireframe=' + (mwCurrent?.screen_name ?? mwCurrent?.name ?? 'null'));
    console.log('  FIXED    surface tally (fallback reads screen_name):  ' + JSON.stringify(tally(screens, surfaceFixed)));
  }

  // 2. Three archetype fixtures (screen_name shape, untagged — simulate stored artifact screens)
  console.log('\n--- 3 archetype fixtures (untagged, screen_name shape) ---');
  const fixtures = {
    SaaS: ['Landing Page', 'Sign Up', 'Dashboard', 'Settings', 'Pricing'],
    marketplace: ['Home Page', 'Register', 'Browse Listings', 'Seller Dashboard', 'Account Profile'],
    content: ['Marketing Page', 'Log In', 'Article Feed', 'User Profile', 'Subscriptions'],
  };
  for (const [name, names] of Object.entries(fixtures)) {
    const screens = names.map((n, i) => ({ screen_id: 's' + i, screen_name: n }));
    const cur = tally(screens, surfaceCurrent);
    const fix = tally(screens, surfaceFixed);
    const mwCur = resolveMarketingWireframe({ screens });
    console.log('  ' + name.padEnd(12) + ' CURRENT=' + JSON.stringify(cur) + ' mw=' + (mwCur?.screen_name ?? 'null') + ' | FIXED=' + JSON.stringify(fix));
  }
  console.log('\n(If CURRENT shows 0 marketing but FIXED shows >=1, the screen_name fallback fix is required for the activation success metric.)');
})();
