#!/usr/bin/env node

/**
 * Run LEO - Interactive LEO Protocol Entry Point
 *
 * Unified command center for all LEO Protocol operations
 * with intuitive multiple choice interface.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawn } = require('child_process');

const ENGINEER_DIR = '/mnt/c/_EHG/EHG_Engineer';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function clearScreen() {
  console.clear();
}

function printHeader() {
  console.log('\n' + '═'.repeat(70));
  console.log('  🦁 LEO PROTOCOL - Command Center');
  console.log('  LEAD → PLAN → EXEC');
  console.log('═'.repeat(70));
  console.log('');
  console.log('  📖 BEFORE PROCEEDING: Read CLAUDE.md and CLAUDE_LEAD.md');
  console.log('     These files contain the LEO Protocol instructions including:');
  console.log('     - Automatic execution mode (no approval prompts)');
  console.log('     - Phase transition commands');
  console.log('     - Sub-agent trigger keywords');
  console.log('');
  console.log('  ⚡ CONTINUOUS MODE: When user says "start SD-XXX", execute');
  console.log('     the handoff immediately. The command IS the approval.');
  console.log('═'.repeat(70) + '\n');
}

function printMenu(title, options) {
  console.log(`📋 ${title}\n`);
  options.forEach((opt, i) => {
    const rec = opt.recommended ? ' ⭐' : '';
    console.log(`  ${i + 1}. ${opt.label}${rec}`);
    if (opt.description) {
      console.log(`     ${opt.description}\n`);
    }
  });
  console.log('-'.repeat(60));
}

async function selectOption(title, options) {
  clearScreen();
  printHeader();
  printMenu(title, options);

  while (true) {
    const answer = await question(`Select [1-${options.length}]: `);
    const num = parseInt(answer);
    if (num >= 1 && num <= options.length) {
      return options[num - 1];
    }
    console.log('Invalid selection. Try again.');
  }
}

function runCommand(cmd, options = {}) {
  console.log(`\n▶ Running: ${cmd}\n`);
  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: options.cwd || ENGINEER_DIR,
      ...options
    });
    return true;
  } catch (error) {
    return false;
  }
}

async function getActiveSD() {
  try {
    const result = execSync(`node -e "
      const { createClient } = require('@supabase/supabase-js');
      require('dotenv').config();
      const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      async function get() {
        const { data } = await supabase.from('strategic_directives_v2').select('id, title, current_phase, status').eq('is_working_on', true).single();
        if (data) console.log(JSON.stringify(data));
      }
      get();
    "`, { encoding: 'utf8', cwd: ENGINEER_DIR }).trim();
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

async function getRecentSDs() {
  try {
    const result = execSync(`node -e "
      const { createClient } = require('@supabase/supabase-js');
      require('dotenv').config();
      const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      async function get() {
        const { data } = await supabase.from('strategic_directives_v2')
          .select('id, title, current_phase, status')
          .in('status', ['draft', 'in_progress', 'active', 'planning'])
          .order('updated_at', { ascending: false })
          .limit(5);
        console.log(JSON.stringify(data || []));
      }
      get();
    "`, { encoding: 'utf8', cwd: ENGINEER_DIR }).trim();
    return JSON.parse(result);
  } catch {
    return [];
  }
}

// ============================================================
// MAIN MENU
// ============================================================

async function mainMenu() {
  const activeSD = await getActiveSD();

  const options = [];

  // Only show Resume if SD is active AND not completed
  if (activeSD && activeSD.status !== 'completed' && activeSD.current_phase !== 'COMPLETED') {
    options.push({
      id: 'resume',
      label: `Resume: ${activeSD.id}`,
      description: `In progress | ${activeSD.title.substring(0, 40)}...`,
      recommended: true,
      action: () => continueSD(activeSD)
    });
  }

  options.push({
    id: 'next',
    label: "What's Next?",
    description: 'Pick from queue or enter a specific SD ID',
    recommended: !activeSD || activeSD.status === 'completed',
    action: whatsNextMenu
  });

  options.push({
    id: 'create',
    label: 'Create New SD',
    description: 'Create a new Strategic Directive from template',
    action: createSDMenu
  });

  options.push({
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Progress, velocity, and test baseline metrics',
    action: dashboardMenu
  });

  options.push({
    id: 'settings',
    label: 'Settings',
    description: 'Hooks, servers, and session recovery',
    action: settingsMenu
  });

  options.push({
    id: 'exit',
    label: 'Exit',
    description: 'Close LEO Command Center',
    action: () => process.exit(0)
  });

  const selected = await selectOption('What would you like to do?', options);
  await selected.action();
}

// ============================================================
// CONTINUE SD
// ============================================================

async function continueSD(sd) {
  // Default: Output continuous mode prompt directly (no sub-menu)
  clearScreen();
  printHeader();
  console.log(`\n🔄 RESUMING SD: ${sd.id}\n`);
  console.log(`   Title: ${sd.title}`);
  console.log(`   Phase: ${sd.current_phase} | Status: ${sd.status}\n`);
  console.log('📋 Continuous Mode Prompt (copy everything below the dashed line):\n');

  runCommand(`npm run leo:prompt ${sd.id}`);

  console.log('\n' + '═'.repeat(60));
  console.log('💡 TIP: Copy the prompt above and paste it to enable continuous mode.');
  console.log('    Then say: "Continue SD ' + sd.id + '" to resume execution.');
  console.log('═'.repeat(60));

  return promptAfterAction();
}

// ============================================================
// HANDOFF MENU
// ============================================================

async function executeHandoffMenu(sd) {
  const phase = sd.current_phase;
  const handoffs = [];

  if (phase === 'LEAD' || phase === 'draft') {
    handoffs.push({ type: 'LEAD-TO-PLAN', desc: 'Move to PLAN phase for PRD creation' });
  }
  if (phase === 'PLAN' || phase === 'PLAN_PRD' || phase === 'planning') {
    handoffs.push({ type: 'PLAN-TO-EXEC', desc: 'Move to EXEC phase for implementation' });
  }
  if (phase === 'EXEC' || phase === 'in_progress' || phase === 'active') {
    handoffs.push({ type: 'PLAN-TO-LEAD', desc: 'Move to LEAD for final approval' });
  }
  if (phase === 'pending_approval') {
    handoffs.push({ type: 'LEAD-FINAL-APPROVAL', desc: 'Complete the SD' });
  }

  const options = handoffs.map(h => ({
    id: h.type,
    label: h.type,
    description: h.desc,
    recommended: true,
    action: () => {
      runCommand(`node scripts/handoff.js execute ${h.type} ${sd.id}`);
      return promptAfterAction();
    }
  }));

  options.push({
    id: 'back',
    label: '← Back',
    action: () => continueSD(sd)
  });

  const selected = await selectOption('Select Handoff to Execute', options);
  await selected.action();
}

// ============================================================
// WHAT'S NEXT? (Merged Queue + Enter SD ID)
// ============================================================

async function whatsNextMenu() {
  const options = [
    {
      id: 'queue',
      label: 'Show SD Queue',
      description: 'View ranked queue with recommendations',
      recommended: true,
      action: async () => {
        runCommand('npm run sd:next');
        console.log('\n' + '-'.repeat(60));
        const answer = await question('Enter SD ID to start (or press Enter to go back): ');
        if (answer.trim()) {
          return startSD(answer.trim());
        }
        return mainMenu();
      }
    },
    {
      id: 'jump',
      label: 'Jump to SD',
      description: 'Enter a specific SD ID directly',
      action: jumpToSD
    },
    {
      id: 'back',
      label: '← Back to Main Menu',
      action: mainMenu
    }
  ];

  const selected = await selectOption("What's Next?", options);
  await selected.action();
}

async function jumpToSD() {
  clearScreen();
  printHeader();

  const recentSDs = await getRecentSDs();

  if (recentSDs.length > 0) {
    console.log('📋 Recent SDs:\n');
    recentSDs.forEach((sd, i) => {
      const statusIcon = sd.status === 'completed' ? '✓' : '○';
      console.log(`  ${statusIcon} ${i + 1}. ${sd.id}`);
      console.log(`       ${sd.title?.substring(0, 45)}...`);
      console.log(`       Phase: ${sd.current_phase} | Status: ${sd.status}\n`);
    });
    console.log('-'.repeat(60));
    console.log('Enter a number to select, or type an SD ID directly.\n');
  }

  const answer = await question('SD ID or number (or "back"): ');

  let sdId = answer.trim();
  const num = parseInt(answer);
  if (num >= 1 && num <= recentSDs.length) {
    sdId = recentSDs[num - 1].id;
  }

  if (!sdId || sdId.toLowerCase() === 'back') {
    return whatsNextMenu();
  }

  return startSD(sdId);
}

async function startSD(sdId) {
  // Default: Output continuous mode prompt directly (no sub-menu)
  clearScreen();
  printHeader();
  console.log(`\n🚀 STARTING SD: ${sdId}\n`);
  console.log('📋 Continuous Mode Prompt (copy everything below the dashed line):\n');

  runCommand(`npm run leo:prompt ${sdId}`);

  console.log('\n' + '═'.repeat(60));
  console.log('💡 TIP: Copy the prompt above and paste it to enable continuous mode.');
  console.log('    Then say: "Start SD ' + sdId + '" to begin execution.');
  console.log('═'.repeat(60));

  return promptAfterAction();
}

// ============================================================
// CREATE SD MENU
// ============================================================

async function createSDMenu() {
  const options = [
    {
      id: 'intelligent',
      label: 'Intelligent Creation (AI-Powered)',
      description: 'Describe your idea, AI generates complete SD with architecture',
      recommended: true,
      action: createSDIntelligent
    },
    {
      id: 'manual',
      label: 'Manual Creation',
      description: 'Enter each field manually',
      action: createSDInteractive
    },
    {
      id: 'template',
      label: 'From Template File',
      description: 'Use existing template scripts',
      action: async () => {
        console.log('\n📁 Template scripts are in: scripts/create-*-sd*.js');
        console.log('\nExamples:');
        console.log('  • scripts/create-vif-strategic-directives.js');
        console.log('  • scripts/create-sdip-strategic-directive.js');
        console.log('\nCopy and modify a template, then run with:');
        console.log('  node scripts/your-new-sd.js\n');
        return promptAfterAction();
      }
    },
    {
      id: 'back',
      label: '← Back to Main Menu',
      action: mainMenu
    }
  ];

  const selected = await selectOption('Create New Strategic Directive', options);
  await selected.action();
}

async function createSDIntelligent() {
  clearScreen();
  printHeader();
  console.log('🧠 INTELLIGENT SD CREATION\n');
  console.log('Describe what you want to build. The AI will:');
  console.log('  • Determine the best SD architecture (standalone/parent-child/grandchild)');
  console.log('  • Auto-generate title, category, priority, and all fields');
  console.log('  • Include testing and documentation requirements');
  console.log('  • Create all necessary SDs automatically\n');
  console.log('-'.repeat(60));
  console.log('Tips:');
  console.log('  • Be as detailed as possible');
  console.log('  • Mention specific features, components, or systems');
  console.log('  • Include any constraints or requirements');
  console.log('  • Type "file:<path>" to load from a file');
  console.log('-'.repeat(60) + '\n');

  const input = await question('Describe your SD (or "back" to cancel):\n> ');

  if (!input.trim() || input.toLowerCase() === 'back') {
    return createSDMenu();
  }

  let description = input;

  // Check if it's a file reference
  if (input.startsWith('file:')) {
    const filePath = input.replace('file:', '').trim();
    try {
      description = fs.readFileSync(path.join(ENGINEER_DIR, filePath), 'utf8');
      console.log(`\n📄 Loaded ${description.length} characters from ${filePath}`);
    } catch (error) {
      console.log(`\n❌ Could not read file: ${filePath}`);
      return promptAfterAction();
    }
  }

  console.log('\n🔄 Analyzing with AI...\n');

  // Run the intelligent SD creation script
  try {
    const result = execSync(
      `node scripts/create-sd-intelligent.js --description "${description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
      {
        stdio: 'inherit',
        cwd: ENGINEER_DIR
      }
    );
  } catch (error) {
    // Script handles its own output, error is expected on user cancel
  }

  return promptAfterAction();
}

async function createSDInteractive() {
  clearScreen();
  printHeader();
  console.log('📋 CREATE NEW STRATEGIC DIRECTIVE\n');
  console.log('This will create a new SD in the database.\n');
  console.log('-'.repeat(60) + '\n');

  // Get SD details
  const title = await question('Title: ');
  if (!title.trim()) {
    console.log('❌ Title is required.');
    return promptAfterAction();
  }

  // Generate ID from title
  const suggestedId = 'SD-' + title.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 3)
    .join('-') + '-001';

  const idAnswer = await question(`SD ID [${suggestedId}]: `);
  const sdId = idAnswer.trim() || suggestedId;

  console.log('\nCategories: feature, infrastructure, database, security, documentation, refactor');
  const category = await question('Category [feature]: ') || 'feature';

  console.log('\nPriorities: critical, high, medium, low');
  const priority = await question('Priority [medium]: ') || 'medium';

  console.log('\nSD Types: feature, infrastructure, database, security, documentation, refactor');
  const sdType = await question(`SD Type [${category}]: `) || category;

  const description = await question('\nDescription (brief): ');
  const rationale = await question('Rationale (why): ');

  // Confirm
  console.log('\n' + '═'.repeat(60));
  console.log('REVIEW:');
  console.log('═'.repeat(60));
  console.log(`ID:          ${sdId}`);
  console.log(`Title:       ${title}`);
  console.log(`Category:    ${category}`);
  console.log(`Priority:    ${priority}`);
  console.log(`SD Type:     ${sdType}`);
  console.log(`Description: ${description.substring(0, 50)}...`);
  console.log('═'.repeat(60));

  const confirm = await question('\nCreate this SD? [Y/n]: ');
  if (confirm.toLowerCase() === 'n') {
    console.log('Cancelled.');
    return promptAfterAction();
  }

  // Create the SD
  const sdKey = sdId.replace('SD-', '');

  const createScript = `
    const { createClient } = require('@supabase/supabase-js');
    require('dotenv').config();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    async function create() {
      const sd = {
        id: '${sdId}',
        sd_key: '${sdKey}',
        title: ${JSON.stringify(title)},
        version: '1.0',
        status: 'draft',
        category: '${category}',
        priority: '${priority}',
        sd_type: '${sdType}',
        current_phase: 'LEAD',
        description: ${JSON.stringify(description || 'To be defined')},
        rationale: ${JSON.stringify(rationale || 'To be defined')},
        scope: 'To be defined during PLAN phase',
        strategic_objectives: [
          'Primary objective - to be defined',
          'TESTING: Test requirements to be defined',
          'DOCUMENTATION: Documentation requirements to be defined'
        ],
        success_criteria: [
          'Primary success criterion - to be defined',
          'TESTING: Test criteria to be defined',
          'DOCUMENTATION: Documentation criteria to be defined'
        ],
        key_changes: [],
        key_principles: [],
        metadata: {
          source: 'LEO Command Center',
          created_via: 'npm run leo',
          testing_requirements: {},
          documentation_requirements: {}
        },
        created_by: 'LEAD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(sd)
        .select()
        .single();

      if (error) {
        console.log('❌ Error:', error.message);
        process.exit(1);
      }
      console.log('✅ SD created:', data.id);
      console.log('\\nNext steps:');
      console.log('1. Run: npm run sd:next to see in queue');
      console.log('2. Run: node scripts/handoff.js execute LEAD-TO-PLAN', data.id);
    }
    create();
  `;

  try {
    execSync(`node -e "${createScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      stdio: 'inherit',
      cwd: ENGINEER_DIR
    });
  } catch (error) {
    console.log('❌ Failed to create SD');
  }

  return promptAfterAction();
}

// ============================================================
// DASHBOARD (Progress, Velocity, Metrics)
// ============================================================

async function dashboardMenu() {
  const options = [
    {
      id: 'progress',
      label: 'SD Progress',
      description: 'Overall completion vs baseline',
      recommended: true,
      action: () => {
        runCommand('npm run sd:status');
        return promptAfterAction();
      }
    },
    {
      id: 'velocity',
      label: 'Velocity & Forecast',
      description: 'Completion rate and projections',
      action: () => {
        runCommand('npm run sd:burnrate');
        return promptAfterAction();
      }
    },
    {
      id: 'tests',
      label: 'Test Baseline',
      description: 'Compare current tests to session baseline',
      action: () => {
        runCommand('npm run hooks:baseline');
        return promptAfterAction();
      }
    },
    {
      id: 'back',
      label: '← Back to Main Menu',
      action: mainMenu
    }
  ];

  const selected = await selectOption('Dashboard', options);
  await selected.action();
}

// ============================================================
// SETTINGS (Hooks, Servers, Recovery)
// ============================================================

async function settingsMenu() {
  const options = [
    {
      id: 'hooks',
      label: 'Configure Hooks',
      description: 'Set up automatic session init, baseline capture',
      recommended: true,
      action: () => {
        runCommand('npm run hooks:setup');
        return promptAfterAction();
      }
    },
    {
      id: 'servers',
      label: 'LEO Servers',
      description: 'Start, stop, or restart the LEO stack',
      action: serversMenu
    },
    {
      id: 'recovery',
      label: 'Session Recovery',
      description: 'Recover from crash or clear session state',
      action: recoveryMenu
    },
    {
      id: 'back',
      label: '← Back to Main Menu',
      action: mainMenu
    }
  ];

  const selected = await selectOption('Settings', options);
  await selected.action();
}

async function serversMenu() {
  const options = [
    {
      id: 'status',
      label: 'Check Status',
      description: 'See which servers are running',
      action: () => {
        runCommand('bash scripts/leo-stack.sh status');
        return promptAfterAction();
      }
    },
    {
      id: 'restart',
      label: 'Restart All',
      description: 'Stop and start all LEO servers',
      action: () => {
        runCommand('bash scripts/leo-stack.sh restart');
        return promptAfterAction();
      }
    },
    {
      id: 'stop',
      label: 'Stop All',
      description: 'Shut down all LEO servers',
      action: () => {
        runCommand('bash scripts/leo-stack.sh stop');
        return promptAfterAction();
      }
    },
    {
      id: 'back',
      label: '← Back',
      action: settingsMenu
    }
  ];

  const selected = await selectOption('LEO Servers', options);
  await selected.action();
}

async function recoveryMenu() {
  const options = [
    {
      id: 'recover',
      label: 'Recover Session',
      description: 'Restore from last checkpoint after crash',
      recommended: true,
      action: () => {
        runCommand('npm run hooks:recover');
        return promptAfterAction();
      }
    },
    {
      id: 'view',
      label: 'View Session State',
      description: 'See current session details',
      action: () => {
        const statePath = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');
        if (fs.existsSync(statePath)) {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          console.log('\n' + '═'.repeat(60));
          console.log('SESSION STATE');
          console.log('═'.repeat(60));
          console.log('Session ID:', state.session_id);
          console.log('Current SD:', state.current_sd || 'none');
          console.log('Current Phase:', state.current_phase || 'unknown');
          console.log('Tool Executions:', state.tool_executions);
          console.log('Last Activity:', state.last_activity);
          console.log('Test Baseline:', state.test_baseline ? 'captured' : 'not captured');
          console.log('Checkpoints:', state.checkpoints?.length || 0);
          console.log('═'.repeat(60));
        } else {
          console.log('\nNo session state found. Start a new session first.');
        }
        return promptAfterAction();
      }
    },
    {
      id: 'clear',
      label: 'Clear Session',
      description: 'Delete all checkpoints and start fresh',
      action: async () => {
        const confirm = await question('\nAre you sure? This deletes all checkpoints. [y/N]: ');
        if (confirm.toLowerCase() === 'y') {
          const statePath = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');
          const checkpointDir = path.join(process.env.HOME || '/tmp', '.claude-checkpoints');
          if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
          if (fs.existsSync(checkpointDir)) {
            fs.readdirSync(checkpointDir).forEach(f => fs.unlinkSync(path.join(checkpointDir, f)));
          }
          console.log('✅ Session state cleared.');
        }
        return promptAfterAction();
      }
    },
    {
      id: 'back',
      label: '← Back',
      action: settingsMenu
    }
  ];

  const selected = await selectOption('Session Recovery', options);
  await selected.action();
}

// ============================================================
// HELPERS
// ============================================================

async function promptAfterAction() {
  console.log();
  const answer = await question('Press Enter to continue (or type "exit" to quit): ');
  if (answer.toLowerCase() === 'exit' || answer.toLowerCase() === 'q') {
    rl.close();
    process.exit(0);
  }
  return mainMenu();
}

// ============================================================
// ENTRY POINT
// ============================================================

async function main() {
  try {
    await mainMenu();
  } catch (error) {
    if (error.message !== 'readline was closed') {
      console.error('Error:', error.message);
    }
  } finally {
    rl.close();
  }
}

main();
