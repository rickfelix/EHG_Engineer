const XLSX = require('xlsx');
const fs = require('fs');

// Read both files
const file1 = '/mnt/c/Users/rickf/Downloads/EHG_30_Strategic_Directives_merged_reranked.xlsx';
const file2 = '/mnt/c/Users/rickf/Dropbox/_EHG/_EHG/EHG Backlog.xlsx';

console.log('Reading Excel files...\n');

const wb1 = XLSX.readFile(file1);
const wb2 = XLSX.readFile(file2);

// Comprehensive analysis
console.log('=== COMPLETE STRATEGIC DIRECTIVES ANALYSIS ===\n');

// 1. Analyze Bundle Scoring
console.log('1. BUNDLE SCORING ANALYSIS:');
console.log('='.repeat(80));
const scoring = XLSX.utils.sheet_to_json(wb1.Sheets['Bundle_Scoring_Tweaked']);
console.log('Total bundles scored:', scoring.length);

// Group by category
const categoryGroups = {};
scoring.forEach(row => {
  const cat = row['Page Category'] || 'Unknown';
  if (!categoryGroups[cat]) categoryGroups[cat] = [];
  categoryGroups[cat].push(row);
});

console.log('\nBundles by Category:');
Object.entries(categoryGroups).forEach(([cat, items]) => {
  console.log(`  ${cat}: ${items.length} bundles`);
});

// 2. Analyze all SD tiers
['SD_High', 'SD_Medium', 'SD_Low'].forEach(sheetName => {
  if (!wb1.Sheets[sheetName]) return;
  
  const data = XLSX.utils.sheet_to_json(wb1.Sheets[sheetName]);
  console.log('\n' + '='.repeat(80));
  console.log(`${sheetName} TIER (${data.length} directives):`);
  console.log('='.repeat(80));
  
  data.forEach((row, i) => {
    console.log(`\n${sheetName}-${i+1}:`);
    console.log(`  Category: ${row['Page Category']}`);
    console.log(`  Page Title: ${row['Page Title (Merged)'] || row['Page Title'] || 'N/A'}`);
    console.log(`  Bundle ID: ${row['Bundle ID'] || 'N/A'}`);
    console.log(`  Sequence Rank: ${row['Sequence Rank'] || 'N/A'}`);
    console.log(`  Objective: ${(row['Objective'] || '').substring(0, 150)}`);
    console.log(`  Why Now: ${(row['Why Now'] || '').substring(0, 150)}`);
    console.log(`  Scope: ${(row['Scope'] || '').substring(0, 150)}`);
    console.log(`  Dependencies: ${row['Dependencies & Constraints'] || 'None'}`);
    console.log(`  Acceptance Criteria: ${(row['Acceptance Criteria'] || '').substring(0, 150)}`);
    console.log(`  KPIs: ${row['KPIs'] || 'N/A'}`);
    console.log(`  GTM: ${row['GTM'] || 'N/A'}`);
    console.log(`  AI/EVA Notes: ${row['AI/EVA Notes'] || 'None'}`);
    console.log(`  Backlog IDs: ${row['Backlog IDs'] || 'None'}`);
    console.log(`  Sample Titles: ${(row['Sample Titles'] || '').substring(0, 100)}`);
  });
});

// 3. Analyze Backlog
console.log('\n' + '='.repeat(80));
console.log('BACKLOG ANALYSIS:');
console.log('='.repeat(80));

const backlogSheet = wb2.Sheets[wb2.SheetNames[0]];
const backlog = XLSX.utils.sheet_to_json(backlogSheet);

console.log('Total backlog items:', backlog.length);

// Count by category
const backlogCategories = {};
backlog.forEach(item => {
  const cat = item['Category'] || item['Page Category'] || 'Uncategorized';
  backlogCategories[cat] = (backlogCategories[cat] || 0) + 1;
});

console.log('\nBacklog Distribution by Category:');
Object.entries(backlogCategories)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count} items`);
  });

console.log('\nFirst 20 Backlog Items:');
backlog.slice(0, 20).forEach((item, i) => {
  console.log(`  ${i+1}. [ID: ${item['ID']}] ${item['Title']}`);
  console.log(`     Category: ${item['Category']}, Status: ${item['Status'] || 'N/A'}`);
  if (item['Description']) {
    console.log(`     Description: ${item['Description'].substring(0, 100)}...`);
  }
});

// 4. Export for further analysis
const fullAnalysis = {
  sdHigh: XLSX.utils.sheet_to_json(wb1.Sheets['SD_High']),
  sdMedium: XLSX.utils.sheet_to_json(wb1.Sheets['SD_Medium']),
  sdLow: XLSX.utils.sheet_to_json(wb1.Sheets['SD_Low']),
  bundleScoring: scoring,
  mergeMap: XLSX.utils.sheet_to_json(wb1.Sheets['Auto_Merge_Map']),
  backlog: backlog,
  stats: {
    totalBundles: scoring.length,
    totalSDs: {
      high: XLSX.utils.sheet_to_json(wb1.Sheets['SD_High']).length,
      medium: XLSX.utils.sheet_to_json(wb1.Sheets['SD_Medium']).length,
      low: XLSX.utils.sheet_to_json(wb1.Sheets['SD_Low']).length
    },
    totalBacklogItems: backlog.length,
    categories: Object.keys(categoryGroups)
  }
};

fs.writeFileSync('/tmp/ehg_full_analysis.json', JSON.stringify(fullAnalysis, null, 2));
console.log('\n\nFull analysis exported to /tmp/ehg_full_analysis.json');
console.log('Total data points analyzed:', 
  fullAnalysis.stats.totalBundles + 
  fullAnalysis.stats.totalSDs.high + 
  fullAnalysis.stats.totalSDs.medium + 
  fullAnalysis.stats.totalSDs.low + 
  fullAnalysis.stats.totalBacklogItems
);