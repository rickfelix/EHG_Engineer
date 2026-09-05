import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PLACEHOLDER_PATTERNS = [
  'to be defined', 'to be determined', 'tbd', 'needs definition', 'will be defined',
  'placeholder', 'insert here', '[add', '[define', '[specify',
  'during planning', 'during technical analysis', 'based on sd objectives', 'based on success metrics'
];
function stripCodeTokens(text) {
  if (!text) return text;
  return text
    .replace(/\b[A-Za-z_$][A-Za-z0-9_$]*\([^()]*\)/g, ' ')
    .replace(/[\w./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|py|sql|json|yml|yaml)\b/g, ' ')
    .replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, ' ');
}
function containsPlaceholder(text) {
  if (!text) return [];
  const n = stripCodeTokens(text).toLowerCase();
  return PLACEHOLDER_PATTERNS.filter((p) => n.includes(p));
}

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prd } = await supabase.from('product_requirements_v2').select('functional_requirements').eq('id', 'PRD-SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-A').maybeSingle();
for (const req of prd.functional_requirements) {
  const text = [req.title, req.description].filter(Boolean).join(' ');
  const hits = containsPlaceholder(text);
  if (hits.length) {
    console.log(req.id, 'MATCHED:', JSON.stringify(hits));
    console.log('  STRIPPED:', stripCodeTokens(text).slice(0, 500));
  }
}
