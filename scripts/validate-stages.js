#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';




// Load stages data
const stagesPath = path.join(__dirname, '../docs/workflow/stages.yaml');
const stagesData = yaml.load(fs.readFileSync(stagesPath, 'utf8'));
const stages = stagesData.stages;

let errors = [];
let warnings = [];
let missing = [];

// Venture Vision v2.0: Check for all 25 stages
for (let i = 1; i <= 25; i++) {
  const stage = stages.find(s => s.id === i);
  if (!stage) {
    errors.push(`Missing stage ${i}`);
  }
}

// Validate dependencies
stages.forEach(stage => {
  stage.depends_on.forEach(dep => {
    if (!stages.find(s => s.id === dep)) {
      errors.push(`Stage ${stage.id} depends on non-existent stage ${dep}`);
    }
    if (dep >= stage.id) {
      warnings.push(`Stage ${stage.id} depends on later stage ${dep} (possible circular dependency)`);
    }
  });
});

// Check for required files
stages.forEach(stage => {
  const padded = String(stage.id).padStart(2, '0');
  
  // Check for SOP
  const sopPattern = `../docs/workflow/sop/${padded}-*.md`;
  import sopFiles from 'glob';.sync(path.join(__dirname, sopPattern));
  if (sopFiles.length === 0) {
    missing.push(`SOP for stage ${stage.id}`);
  }
  
  // Check for individual diagram
  const diagramPath = path.join(__dirname, `../docs/stages/individual/${padded}.mmd`);
  if (!fs.existsSync(diagramPath)) {
    missing.push(`Diagram for stage ${stage.id}`);
  }
  
  // Check for critique
  const critiquePath = path.join(__dirname, `../docs/workflow/critique/stage-${padded}.md`);
  if (!fs.existsSync(critiquePath)) {
    missing.push(`Critique for stage ${stage.id}`);
  }
});

// Check for TBDs
stages.forEach(stage => {
  if (stage.inputs.includes('TBD') || stage.outputs.includes('TBD')) {
    warnings.push(`Stage ${stage.id} has TBD inputs/outputs`);
  }
  if (stage.metrics.includes('TBD')) {
    warnings.push(`Stage ${stage.id} has TBD metrics`);
  }
});

// Report results
console.log('\n=== Workflow Validation Report ===\n');

if (errors.length > 0) {
  console.log('❌ ERRORS:');
  errors.forEach(e => console.log(`   - ${e}`));
} else {
  console.log('✅ No errors found');
}

if (warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  warnings.forEach(w => console.log(`   - ${w}`));
} else {
  console.log('\n✅ No warnings');
}

if (missing.length > 0) {
  console.log('\n📁 MISSING FILES:');
  missing.forEach(m => console.log(`   - ${m}`));
} else {
  console.log('\n✅ All required files present');
}

console.log(`\n=== Summary ===`);
console.log(`Stages: ${stages.length}/25`); // Venture Vision v2.0
console.log(`Errors: ${errors.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Missing files: ${missing.length}`);

process.exit(errors.length > 0 ? 1 : 0);