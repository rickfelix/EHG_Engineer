#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load stages data
const stagesPath = path.join(__dirname, '../docs/workflow/stages.yaml');
const stagesData = yaml.load(fs.readFileSync(stagesPath, 'utf8'));
const stages = stagesData.stages;

// Remove owner field and add progression_mode to notes
stages.forEach(stage => {
  // Remove owner field
  delete stage.owner;
  
  // Add notes field if it doesn't exist
  if (!stage.notes) {
    stage.notes = {};
  }
  
  // Add progression_mode
  stage.notes.progression_mode = "Manual → Assisted → Auto (suggested)";
});

// Save updated stages.yaml
const updatedYaml = yaml.dump({ stages }, { 
  lineWidth: -1,
  noRefs: true,
  sortKeys: false 
});

fs.writeFileSync(stagesPath, updatedYaml);

console.log('✅ Updated stages.yaml - removed owner fields, added progression_mode');

// Validate stage IDs and dependencies
let errors = [];
for (let i = 1; i <= 40; i++) {
  const stage = stages.find(s => s.id === i);
  if (!stage) {
    errors.push(`Missing stage ${i}`);
  } else {
    stage.depends_on.forEach(dep => {
      if (!stages.find(s => s.id === dep)) {
        errors.push(`Stage ${stage.id} depends on non-existent stage ${dep}`);
      }
    });
  }
}

if (errors.length > 0) {
  console.error('❌ Validation errors:', errors);
} else {
  console.log('✅ YAML validation passed - all 40 stages present, dependencies valid');
}