#!/usr/bin/env node

/**
 * Bundle Credential Scanner
 * Scans built client bundles for accidentally leaked credentials
 *
 * Part of SD-HARDENING-V2-001C: Service Role Isolation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Patterns that should NEVER appear in client bundles
const CREDENTIAL_PATTERNS = [
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    pattern: /SUPABASE_SERVICE_ROLE_KEY/gi,
    severity: 'CRITICAL'
  },
  {
    name: 'service_role literal',
    pattern: /service_role/gi,
    severity: 'HIGH'
  },
  {
    name: 'Service role key value',
    // Supabase service role keys start with eyJ and are ~200+ chars
    pattern: /eyJ[A-Za-z0-9_-]{150,}/g,
    severity: 'CRITICAL'
  },
  {
    name: 'API secret key',
    pattern: /api[_-]?secret[_-]?key/gi,
    severity: 'HIGH'
  },
  {
    name: 'Private key marker',
    pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g,
    severity: 'CRITICAL'
  }
];

// Directories to scan (CLIENT BUNDLES ONLY - server dist is OK to have service keys)
const BUNDLE_DIRS = [
  path.join(__dirname, '..', 'src', 'client', 'dist')
];

// File extensions to scan
const SCAN_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx'];

/**
 * Recursively find all files with given extensions
 */
function findFiles(dir, extensions, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findFiles(fullPath, extensions, files);
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Scan a file for credential patterns
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  for (const { name, pattern, severity } of CREDENTIAL_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      findings.push({
        file: path.relative(process.cwd(), filePath),
        pattern: name,
        severity,
        matchCount: matches.length,
        // Don't include actual matches to avoid leaking secrets in logs
        message: `Found ${matches.length} occurrence(s) of ${name}`
      });
    }
  }

  return findings;
}

/**
 * Main scan function
 */
function main() {
  console.log('Bundle Credential Scanner');
  console.log('='.repeat(50));
  console.log('');

  let allFindings = [];
  let filesScanned = 0;

  for (const bundleDir of BUNDLE_DIRS) {
    if (!fs.existsSync(bundleDir)) {
      console.log(`Skipping ${bundleDir} (does not exist)`);
      continue;
    }

    console.log(`Scanning: ${bundleDir}`);
    const files = findFiles(bundleDir, SCAN_EXTENSIONS);
    console.log(`  Found ${files.length} files to scan`);

    for (const file of files) {
      const findings = scanFile(file);
      if (findings.length > 0) {
        allFindings = allFindings.concat(findings);
      }
      filesScanned++;
    }
  }

  console.log('');
  console.log(`Total files scanned: ${filesScanned}`);
  console.log('');

  // Write results to file for CI reporting
  fs.writeFileSync(
    'credential-scan-results.json',
    JSON.stringify(allFindings, null, 2)
  );

  if (allFindings.length === 0) {
    console.log('No credential leaks detected in bundles');
    process.exit(0);
  }

  // Report findings
  console.log('CREDENTIAL LEAKS DETECTED:');
  console.log('='.repeat(50));

  for (const finding of allFindings) {
    const icon = finding.severity === 'CRITICAL' ? '' : '';
    console.log(`${icon} [${finding.severity}] ${finding.file}`);
    console.log(`   ${finding.message}`);
    console.log('');
  }

  const criticalCount = allFindings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = allFindings.filter(f => f.severity === 'HIGH').length;

  console.log('='.repeat(50));
  console.log(`Summary: ${criticalCount} CRITICAL, ${highCount} HIGH`);
  console.log('');
  console.log('BUNDLE CREDENTIAL SCAN FAILED');
  console.log('Remove service_role keys and secrets from client-side code.');

  process.exit(1);
}

main();
