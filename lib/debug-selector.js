import { selectSubAgents, extractSDContent, calculateDomainScore, DOMAIN_KEYWORDS } from './context-aware-sub-agent-selector.js';

// Test 1.1: Strong database signals
const sd = {
  id: 'TEST-001',
  title: 'Database Migration for User Tables',
  description: 'Create migration scripts for user authentication tables with RLS policies',
  business_value: '',
  acceptance_criteria: '',
  technical_notes: '',
  status: 'draft'
};

console.log('Input SD:');
console.log(JSON.stringify(sd, null, 2));
console.log('');

const content = extractSDContent(sd);
console.log('Extracted Content:');
console.log(JSON.stringify(content, null, 2));
console.log('');

// Test DATABASE domain specifically
const databaseDomain = DOMAIN_KEYWORDS.DATABASE;
const match = calculateDomainScore(content, databaseDomain);

console.log('DATABASE Domain Match:');
console.log(`  Score: ${match.score}`);
console.log(`  Total Matches: ${match.totalMatches}`);
console.log(`  Meets Minimum (${databaseDomain.minMatches}): ${match.meetsMinimum}`);
console.log(`  Matched Keywords: ${match.matchedKeywords.join(', ')}`);
console.log('  Breakdown:', JSON.stringify(match.breakdown, null, 2));
console.log('');

const result = selectSubAgents(sd);
console.log('Selection Result:');
console.log(JSON.stringify(result, null, 2));
console.log('');

const hasDatabase = result.recommended.some(r => r.code === 'DATABASE');
console.log(`Has DATABASE agent? ${hasDatabase}`);
