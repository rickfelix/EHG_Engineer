#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load configurations
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const allowedDeps = JSON.parse(fs.readFileSync('config/allowed-deps.json', 'utf8'));

// Combine all dependencies
const allDeps = {
  ...packageJson.dependencies || {},
  ...packageJson.devDependencies || {}
};

// Check each dependency
const unknown = [];
const denied = [];

Object.keys(allDeps).forEach(dep => {
  const depName = dep.split('@').slice(0, -1).join('@') || dep; // Handle scoped packages

  if (allowedDeps.deny.includes(depName)) {
    denied.push(dep);
  } else if (!allowedDeps.allow.includes(depName)) {
    unknown.push(dep);
  }
});

// Print results
console.log('🔍 Dependency Policy Check\n');

if (denied.length > 0) {
  console.log('❌ DENIED dependencies found:');
  denied.forEach(d => console.log(`   - ${d}`));
  console.log('');
}

if (unknown.length > 0) {
  console.log('⚠️  Unknown dependencies (not in allow list):');
  unknown.forEach(d => console.log(`   - ${d}`));
  console.log('');
}

if (denied.length === 0 && unknown.length === 0) {
  console.log('✅ All dependencies are allowed\n');
}

console.log(`Summary: ${Object.keys(allDeps).length} total, ${unknown.length} unknown, ${denied.length} denied`);

// Exit 0 for warning mode (will change to 1 when ready to block)
process.exit(0);