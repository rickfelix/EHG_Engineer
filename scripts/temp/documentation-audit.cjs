require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Documentation requirements by SD type
const DOC_REQUIREMENTS = {
  'feature': { required: true, docs: ['User guide in docs/04_features/', 'API docs if applicable'] },
  'api': { required: true, docs: ['OpenAPI spec', 'Endpoint docs in docs/02_api/'] },
  'database': { required: true, docs: ['Schema docs in docs/database/', 'Migration notes'] },
  'infrastructure': { required: true, docs: ['Runbook', 'Operational docs in docs/06_deployment/'] },
  'security': { required: true, docs: ['Security considerations in docs/reference/'] },
  'enhancement': { required: true, docs: ['Feature update docs'] },
  'refactor': { required: false, docs: ['CHANGELOG entry', 'Architecture notes if major'] },
  'fix': { required: false, docs: ['CHANGELOG entry only'] },
  'bugfix': { required: false, docs: ['CHANGELOG entry only'] },
  'documentation': { required: false, docs: ['Self-documenting'] },
  'discovery_spike': { required: false, docs: ['Research findings if valuable'] }
};

async function auditDocumentation() {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Query completed SDs from last 14 days
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, status, current_phase, created_at, updated_at')
    .gte('updated_at', fourteenDaysAgo.toISOString())
    .in('status', ['completed', 'shipped', 'merged'])
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error querying SDs:', error.message);
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('DOCUMENTATION GAP AUDIT - SDs from last 14 days');
  console.log('='.repeat(80));
  console.log(`\nFound ${sds.length} completed SDs\n`);

  const results = {
    requiresDocs: [],
    minimalDocs: [],
    gaps: [],
    compliant: []
  };

  // Analyze each SD
  for (const sd of sds) {
    const type = sd.sd_type || 'unknown';
    const reqs = DOC_REQUIREMENTS[type] || { required: true, docs: ['Standard documentation'] };

    const sdResult = {
      id: sd.id,
      title: sd.title,
      type: type,
      status: sd.status,
      updated: sd.updated_at.split('T')[0],
      requiresFullDocs: reqs.required,
      expectedDocs: reqs.docs,
      foundDocs: [],
      missingDocs: [],
      issues: []
    };

    if (reqs.required) {
      results.requiresDocs.push(sdResult);

      // Search for documentation
      const searchTerms = [
        sd.id.toLowerCase(),
        sd.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30)
      ];

      // Check docs folder
      const docsPath = path.join(process.cwd(), 'docs');
      const foundFiles = searchDocsFolder(docsPath, searchTerms);
      sdResult.foundDocs = foundFiles;

      if (foundFiles.length === 0) {
        sdResult.missingDocs = reqs.docs;
        results.gaps.push(sdResult);
      } else {
        // Validate format of found docs
        for (const file of foundFiles) {
          const issues = validateDocFormat(file);
          if (issues.length > 0) {
            sdResult.issues.push(...issues.map(i => `${path.basename(file)}: ${i}`));
          }
        }

        if (sdResult.issues.length > 0) {
          results.gaps.push(sdResult);
        } else {
          results.compliant.push(sdResult);
        }
      }
    } else {
      results.minimalDocs.push(sdResult);
    }
  }

  // Output report
  console.log('\n' + '='.repeat(80));
  console.log('GAP ANALYSIS REPORT');
  console.log('='.repeat(80));

  console.log(`\n📊 SUMMARY`);
  console.log(`   Total SDs audited: ${sds.length}`);
  console.log(`   Requiring full documentation: ${results.requiresDocs.length}`);
  console.log(`   Minimal docs only (changelog): ${results.minimalDocs.length}`);
  console.log(`   ✅ Compliant: ${results.compliant.length}`);
  console.log(`   ❌ Gaps found: ${results.gaps.length}`);

  if (results.gaps.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('❌ DOCUMENTATION GAPS');
    console.log('-'.repeat(60));

    for (const sd of results.gaps) {
      console.log(`\n  ${sd.id}`);
      console.log(`  Title: ${sd.title}`);
      console.log(`  Type: ${sd.type}`);
      console.log(`  Expected: ${sd.expectedDocs.join(', ')}`);

      if (sd.foundDocs.length === 0) {
        console.log(`  Found: NONE - Missing documentation`);
      } else {
        console.log(`  Found: ${sd.foundDocs.map(f => path.basename(f)).join(', ')}`);
        if (sd.issues.length > 0) {
          console.log(`  Issues:`);
          sd.issues.forEach(i => console.log(`    - ${i}`));
        }
      }
    }
  }

  if (results.compliant.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('✅ COMPLIANT SDs');
    console.log('-'.repeat(60));
    results.compliant.forEach(sd => {
      console.log(`  ${sd.id}: ${sd.title}`);
    });
  }

  if (results.minimalDocs.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log('📋 MINIMAL DOCS (changelog only)');
    console.log('-'.repeat(60));
    results.minimalDocs.forEach(sd => {
      console.log(`  ${sd.id} (${sd.type}): ${sd.title}`);
    });
  }

  // Output JSON for further processing
  fs.writeFileSync(
    path.join(process.cwd(), 'scripts/temp/documentation-audit-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n\n📁 Full results saved to: scripts/temp/documentation-audit-results.json');

  return results;
}

function searchDocsFolder(docsPath, searchTerms) {
  const found = [];

  function searchDir(dir) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          searchDir(fullPath);
        } else if (item.endsWith('.md')) {
          const lowerItem = item.toLowerCase();
          const content = fs.readFileSync(fullPath, 'utf8').toLowerCase();

          for (const term of searchTerms) {
            if (lowerItem.includes(term) || content.includes(term)) {
              found.push(fullPath);
              break;
            }
          }
        }
      }
    } catch (e) {
      // Skip directories we can't read
    }
  }

  searchDir(docsPath);
  return found;
}

function validateDocFormat(filePath) {
  const issues = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Check for metadata header
    if (!content.includes('## Metadata') && !content.includes('**Category**:') && !content.includes('**Status**:')) {
      issues.push('Missing metadata header');
    }

    // Check file naming (should be kebab-case)
    const fileName = path.basename(filePath);
    if (/[A-Z]/.test(fileName) && !['README.md', 'CLAUDE.md', 'API_REFERENCE.md', 'CHANGELOG.md'].includes(fileName)) {
      issues.push('File name should be kebab-case');
    }

    // Check location
    const relativePath = path.relative(process.cwd(), filePath);
    const prohibitedPaths = ['src/', 'lib/', 'scripts/', 'tests/', 'public/'];
    for (const prohibited of prohibitedPaths) {
      if (relativePath.startsWith(prohibited)) {
        issues.push(`Documentation in prohibited location: ${prohibited}`);
      }
    }

  } catch (e) {
    issues.push(`Cannot read file: ${e.message}`);
  }

  return issues;
}

auditDocumentation().catch(console.error);
