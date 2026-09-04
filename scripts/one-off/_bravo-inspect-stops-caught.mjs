import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const PLACEHOLDER_PATTERNS = ['to be defined','to be determined','tbd','needs definition','will be defined','placeholder','insert here','[add','[define','[specify','during planning','during technical analysis','based on sd objectives','based on success metrics'];
const BOILERPLATE_REQUIREMENTS = ['to be defined based on sd objectives','to be defined during planning','to be defined during technical analysis','implement the feature','create the functionality','add capability'];
function whichPattern(text) {
  if (!text) return null;
  const n = text.toLowerCase();
  for (const p of PLACEHOLDER_PATTERNS) if (n.includes(p)) return 'PLACEHOLDER:' + p;
  for (const p of BOILERPLATE_REQUIREMENTS) if (n.toLowerCase().trim().includes(p.toLowerCase())) return 'BOILERPLATE_REQ:' + p;
  return null;
}
function normalizeToArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { /* not JSON */ }
    return value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }
  if (typeof value === 'object') return [value];
  return [];
}

const PAGE = 1000;
let from = 0;
let data = [];
for (;;) {
  const { data: page, error } = await supabase.from('product_requirements_v2').select('id, sd_id, functional_requirements').range(from, from + PAGE - 1);
  if (error) throw error;
  if (!page || page.length === 0) break;
  data = data.concat(page);
  if (page.length < PAGE) break;
  from += PAGE;
}
console.log('fetched (paginated):', data.length);

let shown = 0;
for (const row of data) {
  const funcReqs = normalizeToArray(row.functional_requirements);
  for (const req of funcReqs) {
    if (typeof req === 'string') continue;
    const oldText = req?.requirement || JSON.stringify(req);
    const newText = [req?.title, req?.description].filter(Boolean).join(' ');
    const oldHit = whichPattern(oldText);
    const newHit = whichPattern(newText);
    if (oldHit && !newHit) {
      const nestedAC = req.acceptance_criteria;
      const nestedText = Array.isArray(nestedAC) ? nestedAC.join(' | ') : (typeof nestedAC === 'string' ? nestedAC : '');
      const nestedHit = whichPattern(nestedText);
      if (nestedHit) {
        shown++;
        console.log('---', shown, row.id, req.id, '---');
        console.log('  oldHit:', oldHit, '(matched against JSON.stringify or .requirement)');
        console.log('  nestedHit (still present in acceptance_criteria):', nestedHit);
        console.log('  full acceptance_criteria:', JSON.stringify(nestedAC));
        console.log('  title:', req.title);
        console.log('  description:', (req.description||'').slice(0,200));
      }
    }
  }
}
console.log('total shown:', shown);
