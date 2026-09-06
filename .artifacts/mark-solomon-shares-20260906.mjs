import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { markRatificationEncoded } from '../lib/chairman/ratification-writer.mjs';

const repoRoot = process.cwd();
const s = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const manifest = JSON.parse(readFileSync(`${repoRoot}/claude-generation-manifest.json`, 'utf8'));
const manifestHash = manifest.section_digests.byId['611'];
if (!manifestHash) throw new Error('manifest has no digest for section 611');

const ROWS = [
  ['2b14e48d-b9d1-4187-b491-01d211dd1695', 'MICHAEL SEAT MODEL (v0.3): Opus at medium effort, Sonnet fallback under account quota; Opus verification before any rule-encode that flips auto_apply or supersedes a rule (ratification 2b14e48d)'],
  ['42111a33-9d4e-445a-bf4a-b02afa871736', 'MICHAEL REMAINING CONDITIONS (v0.3): Q2, Q3, Q6, Q7 as written; Q8 tasks-classifier pulled into v1 scope, no Todoist-only caveat on the overdue measure (ratification 42111a33)'],
];
// be6e9d73: full id resolved live below (only the prefix was on hand).
const { data: leg4 } = await s.from('chairman_ratifications').select('id').gte('ratified_at', '2026-09-05T19:00:00Z').lte('ratified_at', '2026-09-05T20:00:00Z');
const leg4Row = (leg4 || []).find((r) => r.id.startsWith('be6e9d73'));
if (!leg4Row) throw new Error('be6e9d73 row not found');
ROWS.push([leg4Row.id, 'LEG4 CAPACITY EARNS IN POINTS, NOT A BINARY: TIGHT=2, DEFICIT=1, DEFICIT-URGENT=0, SURPLUS=1 OF THE 2-POINT LEG MAXIMUM (ratification be6e9d73)']);

const { data: sec } = await s.from('leo_protocol_sections').select('content').eq('id', '611').single();
for (const [id, markerText] of ROWS) {
  if (!sec.content.includes(markerText)) throw new Error(`marker not a literal substring of 611: ${id}`);
  const r = await markRatificationEncoded(s, id, { sectionId: '611', manifestHash, markerText, repoRoot });
  console.log(id.slice(0, 8), JSON.stringify(r).slice(0, 200));
}
const { data: back } = await s.from('chairman_ratifications').select('id, encoded_at, encoded_ref').in('id', ROWS.map((r) => r[0]));
for (const b of back || []) console.log('readback', b.id.slice(0, 8), b.encoded_at, b.encoded_ref);
