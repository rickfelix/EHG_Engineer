import { readFileSync } from 'node:fs';

const prd = JSON.parse(readFileSync(process.argv[2], 'utf8'));

const PLACEHOLDER_PATTERNS = [
  'to be defined', 'to be determined', 'tbd', 'needs definition', 'will be defined',
  'placeholder', 'insert here', '[add', '[define', '[specify',
  'during planning', 'during technical analysis', 'based on sd objectives', 'based on success metrics'
];

function containsPlaceholder(text) {
  const normalized = text.toLowerCase();
  return PLACEHOLDER_PATTERNS.filter((p) => normalized.includes(p));
}

for (const req of prd.functional_requirements) {
  const text = req.requirement || JSON.stringify(req);
  const hits = containsPlaceholder(text);
  console.log(req.id, '| has .requirement field?', !!req.requirement, '| pattern hits:', JSON.stringify(hits));
}
