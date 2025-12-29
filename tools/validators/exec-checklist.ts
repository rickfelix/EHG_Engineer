#!/usr/bin/env node

/**
 * EXEC Pre-Implementation Checklist Validator
 *
 * Enforces mandatory verification before code generation
 * Based on CLAUDE.md requirements
 */

import { createClient } from '@supabase/supabase-js';
import * as puppeteer from 'puppeteer';
import * as fs from 'fs/promises';
import * as path from 'path';

// Get Supabase client (lazy initialization)
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  );
}

interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  status: 'pending' | 'pass' | 'fail' | 'skipped';
  evidence?: string;
  error?: string;
}

interface ChecklistResult {
  prdId: string;
  passed: boolean;
  items: ChecklistItem[];
  evidence: {
    screenshots?: string[];
    urls?: string[];
    components?: string[];
    timestamps?: string[];
  };
  summary: string;
}

/**
 * Verify URL is accessible
 */
async function verifyURL(url: string): Promise<{
  accessible: boolean;
  statusCode?: number;
  screenshot?: string;
  error?: string;
}> {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Navigate to URL
    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    if (!response) {
      await browser.close();
      return {
        accessible: false,
        error: 'No response from URL'
      };
    }

    const statusCode = response.status();
    const accessible = statusCode >= 200 && statusCode < 400;

    // Take screenshot
    const screenshotDir = path.join(process.cwd(), 'screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });

    const screenshotPath = path.join(
      screenshotDir,
      `exec-checklist-${Date.now()}.png`
    );

    await page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    await browser.close();

    return {
      accessible,
      statusCode,
      screenshot: screenshotPath
    };
  } catch (error) {
    return {
      accessible: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Identify component file path
 */
async function identifyComponent(
  componentName: string,
  searchPaths: string[] = ['src', 'components', 'app']
): Promise<{
  found: boolean;
  path?: string;
  error?: string;
}> {
  try {
    for (const searchPath of searchPaths) {
      const fullPath = path.join(process.cwd(), searchPath);

      try {
        await fs.access(fullPath);
      } catch {
        continue; // Directory doesn't exist
      }

      // Search for component file
      const files = await walkDirectory(fullPath);

      for (const file of files) {
        const basename = path.basename(file, path.extname(file));

        // Check for exact or close match
        if (basename.toLowerCase() === componentName.toLowerCase() ||
            basename.toLowerCase().includes(componentName.toLowerCase())) {

          // Verify it's a component file
          if (file.match(/\.(tsx?|jsx?|vue|svelte)$/)) {
            return {
              found: true,
              path: file
            };
          }
        }
      }
    }

    return {
      found: false,
      error: `Component ${componentName} not found in search paths`
    };
  } catch (error) {
    return {
      found: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Walk directory recursively
 */
async function walkDirectory(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      files.push(...await walkDirectory(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Verify application context
 */
async function verifyApplicationContext(
  appPath: string,
  port: number
): Promise<{
  valid: boolean;
  details?: {
    path: string;
    port: number;
    packageJson?: boolean;
    serverRunning?: boolean;
  };
  error?: string;
}> {
  try {
    // Check if path exists
    await fs.access(appPath);

    // Check for package.json
    const packageJsonPath = path.join(appPath, 'package.json');
    let hasPackageJson = false;

    try {
      await fs.access(packageJsonPath);
      hasPackageJson = true;
    } catch {
      // No package.json
    }

    // Check if server is running on port
    const serverRunning = await checkPortInUse(port);

    return {
      valid: hasPackageJson,
      details: {
        path: appPath,
        port,
        packageJson: hasPackageJson,
        serverRunning
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if port is in use
 */
async function checkPortInUse(port: number): Promise<boolean> {
  const net = await import('net');

  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(false); // Port is free
    });

    server.listen(port);
  });
}

/**
 * Run the EXEC pre-implementation checklist
 */
export async function validateEXECChecklist(
  prdId: string,
  prdContent?: {
    targetURL?: string;
    componentName?: string;
    appPath?: string;
    port?: number;
  }
): Promise<ChecklistResult> {
  console.log('📋 EXEC Pre-Implementation Checklist');
  console.log('='.repeat(60));
  console.log(`PRD: ${prdId}`);
  console.log(`PRD content provided: ${prdContent ? 'YES' : 'NO'}\n`);

  const items: ChecklistItem[] = [
    {
      id: 'url-verification',
      label: 'URL verified and accessible',
      required: true,
      status: 'pending'
    },
    {
      id: 'component-identification',
      label: 'Component identified and exists',
      required: true,
      status: 'pending'
    },
    {
      id: 'application-context',
      label: 'Application context verified',
      required: true,
      status: 'pending'
    },
    {
      id: 'visual-confirmation',
      label: 'Screenshot taken of current state',
      required: true,
      status: 'pending'
    },
    {
      id: 'port-confirmation',
      label: 'Port number confirmed',
      required: true,
      status: 'pending'
    },
    {
      id: 'target-location',
      label: 'Target location for changes confirmed',
      required: true,
      status: 'pending'
    }
  ];

  const evidence: ChecklistResult['evidence'] = {
    screenshots: [],
    urls: [],
    components: [],
    timestamps: []
  };

  // If no content provided, try to fetch from database
  if (!prdContent) {
    console.log('🔍 Fetching PRD from database...');
    const supabase = getSupabaseClient();
    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('target_url, component_name, app_path, port')
      .eq('id', prdId)
      .single();

    console.log('Query result:', { prd, error });

    if (prd) {
      prdContent = {
        targetURL: prd.target_url,
        componentName: prd.component_name,
        appPath: prd.app_path || process.cwd(),
        port: prd.port || 3000
      };
      console.log('PRD content loaded:', prdContent);
    }
  }

  // 1. URL Verification
  const urlItem = items.find(i => i.id === 'url-verification')!;
  if (prdContent?.targetURL) {
    console.log('🔍 Verifying URL...');
    const urlResult = await verifyURL(prdContent.targetURL);

    if (urlResult.accessible) {
      urlItem.status = 'pass';
      urlItem.evidence = `URL ${prdContent.targetURL} is accessible (status: ${urlResult.statusCode})`;

      if (urlResult.screenshot) {
        evidence.screenshots!.push(urlResult.screenshot);
        items.find(i => i.id === 'visual-confirmation')!.status = 'pass';
      }

      evidence.urls!.push(prdContent.targetURL);
      console.log(`  ✅ ${urlItem.label}`);
    } else {
      urlItem.status = 'fail';
      urlItem.error = urlResult.error;
      console.log(`  ❌ ${urlItem.label}: ${urlResult.error}`);
    }
  } else {
    urlItem.status = 'skipped';
    urlItem.error = 'No target URL provided';
  }

  // 2. Component Identification
  const componentItem = items.find(i => i.id === 'component-identification')!;
  if (prdContent?.componentName) {
    console.log('🔍 Identifying component...');
    const componentResult = await identifyComponent(prdContent.componentName);

    if (componentResult.found) {
      componentItem.status = 'pass';
      componentItem.evidence = `Component found at: ${componentResult.path}`;
      evidence.components!.push(componentResult.path!);
      console.log(`  ✅ ${componentItem.label}`);
    } else {
      componentItem.status = 'fail';
      componentItem.error = componentResult.error;
      console.log(`  ❌ ${componentItem.label}: ${componentResult.error}`);
    }
  } else {
    componentItem.status = 'skipped';
    componentItem.error = 'No component name provided';
  }

  // 3. Application Context
  const appItem = items.find(i => i.id === 'application-context')!;
  const portItem = items.find(i => i.id === 'port-confirmation')!;

  if (prdContent?.appPath && prdContent?.port) {
    console.log('🔍 Verifying application context...');
    const appResult = await verifyApplicationContext(prdContent.appPath, prdContent.port);

    if (appResult.valid) {
      appItem.status = 'pass';
      appItem.evidence = `App at ${prdContent.appPath} is valid`;

      portItem.status = 'pass';
      portItem.evidence = `Port ${prdContent.port} confirmed`;

      console.log(`  ✅ ${appItem.label}`);
      console.log(`  ✅ ${portItem.label}`);

      if (!appResult.details?.serverRunning) {
        console.log(`  ⚠️  Warning: Server not running on port ${prdContent.port}`);
      }
    } else {
      appItem.status = 'fail';
      appItem.error = appResult.error;
      console.log(`  ❌ ${appItem.label}: ${appResult.error}`);
    }
  } else {
    appItem.status = 'skipped';
    portItem.status = 'skipped';
  }

  // 4. Target Location
  const targetItem = items.find(i => i.id === 'target-location')!;
  if (componentItem.status === 'pass') {
    targetItem.status = 'pass';
    targetItem.evidence = 'Target location identified from component path';
    console.log(`  ✅ ${targetItem.label}`);
  } else {
    targetItem.status = 'fail';
    targetItem.error = 'Cannot confirm target without component identification';
  }

  // Add timestamps
  evidence.timestamps!.push(new Date().toISOString());

  // Calculate overall pass/fail
  const requiredItems = items.filter(i => i.required);
  const passedItems = requiredItems.filter(i => i.status === 'pass');
  const passed = passedItems.length === requiredItems.length;

  // Generate summary
  const summary = passed
    ? `All ${requiredItems.length} required checks passed. Ready for implementation.`
    : `Only ${passedItems.length}/${requiredItems.length} checks passed. Not ready for implementation.`;

  const result: ChecklistResult = {
    prdId,
    passed,
    items,
    evidence,
    summary
  };

  // Store result in database
  await storeChecklistResult(result);

  // Display results
  displayChecklistResult(result);

  return result;
}

/**
 * Store checklist result
 */
async function storeChecklistResult(result: ChecklistResult): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('compliance_alerts').insert({
    alert_type: result.passed ? 'missing_artifact' : 'boundary_violation',
    severity: result.passed ? 'info' : 'warning',
    source: 'exec-checklist',
    message: `EXEC checklist ${result.passed ? 'passed' : 'failed'} for PRD ${result.prdId}`,
    payload: {
      prd_id: result.prdId,
      passed: result.passed,
      items: result.items,
      evidence: result.evidence,
      summary: result.summary,
      timestamp: new Date().toISOString()
    },
    resolved: result.passed
  });
}

/**
 * Display checklist results
 */
function displayChecklistResult(result: ChecklistResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 CHECKLIST RESULTS');
  console.log('='.repeat(60));

  const icon = result.passed ? '✅' : '❌';
  console.log(`\n${icon} Overall: ${result.passed ? 'PASSED' : 'FAILED'}`);
  console.log(`📝 Summary: ${result.summary}`);

  console.log('\n📋 Checklist Items:');
  for (const item of result.items) {
    const statusIcon = {
      pass: '✅',
      fail: '❌',
      pending: '⏳',
      skipped: '⏭️'
    }[item.status];

    console.log(`  ${statusIcon} ${item.label}`);

    if (item.evidence) {
      console.log(`     Evidence: ${item.evidence}`);
    }
    if (item.error) {
      console.log(`     Error: ${item.error}`);
    }
  }

  if (result.evidence.screenshots?.length) {
    console.log(`\n📸 Screenshots saved: ${result.evidence.screenshots.length}`);
  }

  if (!result.passed) {
    console.log('\n⚠️  Implementation blocked until all checks pass!');
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const prdId = args[0] || process.env.PRD_ID;

  if (!prdId) {
    console.error('Usage: exec-checklist.ts <PRD_ID>');
    console.error('   or: PRD_ID=PRD-SD-001 npx tsx exec-checklist.ts');
    process.exit(1);
  }

  // Optional: Parse additional arguments
  const targetURL = args.find(a => a.startsWith('--url='))?.split('=')[1];
  const componentName = args.find(a => a.startsWith('--component='))?.split('=')[1];
  const appPath = args.find(a => a.startsWith('--path='))?.split('=')[1];
  const portArg = args.find(a => a.startsWith('--port='))?.split('=')[1];
  const port = portArg ? parseInt(portArg) : undefined;

  // Only pass prdContent if any args were provided
  const hasArgs = targetURL || componentName || appPath || port;

  validateEXECChecklist(prdId, hasArgs ? {
    targetURL,
    componentName,
    appPath,
    port
  } : undefined)
    .then(result => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Checklist validation failed:', error);
      process.exit(1);
    });
}