import fs from 'fs';
import { generateUserJourneys } from '../lib/eva/stage-templates/analysis-steps/stage-15-user-journey.js';

const snap = JSON.parse(fs.readFileSync('scripts/one-off/fix-stage-journey-001-fixture-snapshot.json', 'utf8'));
const quiet = { log(){}, warn(){}, error(){} };

for (const key of Object.keys(snap)) {
  const v = snap[key];
  // personas: derive from the journey artifact's persona_refs (snapshot has no personas key)
  const personaNames = [...new Set((v.journey?.journeys || []).map(j => j.persona_ref))].filter(Boolean);
  const ctx = {
    stage10Data: { customerPersonas: personaNames.map(n => ({ name: n })) },
    userStoryPack: v.storyPack,
    wireframeScreensPayload: v.wireframeScreensPayload,
    logger: quiet,
  };
  const out = await generateUserJourneys(ctx);
  const steps = out.journeys.flatMap(j => j.steps);
  const refs = steps.flatMap(s => s.story_refs);
  const orphans = out.journeys.flatMap(j => j.orphan_story_ids || []);
  const routes = steps.map(s => s.route);
  const HEX = /^sty-[0-9a-f]{8}$/;
  console.log(`\n### ${key} (venture ${v.venture_id})`);
  console.log(' journeys:', out.journeys.length, '| steps:', steps.length);
  console.log(' story_refs total:', refs.length, '| ALL match sty-<8hex>:', refs.every(r => HEX.test(String(r))));
  console.log(' story_refs containing "|" (raw composite prose):', refs.filter(r => String(r).includes('|')).length);
  console.log(' story_refs unique:', new Set(refs).size, '(collisions:', refs.length - new Set(refs).size, ')');
  console.log(' orphan_story_ids:', orphans.length, '| ALL hex:', orphans.every(r => HEX.test(String(r))));
  console.log(' routes non-null:', routes.filter(r => r !== null).length, '/', routes.length);
  console.log(' distinct routes:', JSON.stringify([...new Set(routes)]));
  // do any routes look dangerous (scheme, traversal, CRLF, protocol-relative)?
  const bad = [...new Set(routes)].filter(r => typeof r === 'string' && /^(javascript:|data:|vbscript:|\/\/|https?:)|\.\.|[\r\n\u0000]/i.test(r));
  console.log(' DANGEROUS-SHAPED routes:', JSON.stringify(bad));
  console.log(' finding types:', JSON.stringify(out.findings.reduce((a,f)=>(a[f.type]=(a[f.type]||0)+1,a),{})));
  // what raw LLM prose lands in findings?
  const rawish = out.findings.flatMap(f => [f.screen_name, f.flow_name, f.page_name].filter(Boolean));
  console.log(' raw-prose values in findings (sample):', JSON.stringify(rawish.slice(0,6)));
  console.log(' coverage_selfcheck.flows:', out.coverage_selfcheck.flows_covered, '/', out.coverage_selfcheck.flows_total, '| uncovered:', JSON.stringify(out.coverage_selfcheck.uncovered_flows));
}
