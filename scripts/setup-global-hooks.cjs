#!/usr/bin/env node

/**
 * Interactive Global Hooks Setup
 * SD-CLAUDE-CODE-2.1.0-LEO-001
 *
 * Configures Claude Code global hooks via an intuitive CLI interface.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SETTINGS_PATH = '/mnt/c/_EHG/EHG_Engineer/.claude/settings.json';
const HOOKS_DIR = '/mnt/c/_EHG/EHG_Engineer/scripts/hooks';

// Available hooks with descriptions
const AVAILABLE_HOOKS = {
  PreToolUse: [
    {
      id: 'session-init',
      name: 'Session Initialization',
      description: 'Detects current SD from git branch, initializes session state',
      script: 'session-init.cjs',
      once: true,
      recommended: true
    },
    {
      id: 'baseline-capture',
      name: 'Test Baseline Capture',
      description: 'Captures test state at session start to distinguish new vs pre-existing failures',
      script: 'capture-baseline-test-state.cjs',
      once: true,
      recommended: true
    }
  ],
  PostToolUse: [
    {
      id: 'model-tracking',
      name: 'Model Tracking',
      description: 'Logs which Claude model is used for auditing',
      script: 'model-tracking.cjs',
      once: false,
      recommended: false
    },
    {
      id: 'session-persist',
      name: 'Session Persistence',
      description: 'Creates checkpoints for crash recovery (every 5 tools or 2 min)',
      script: 'persist-session-state.cjs',
      once: false,
      recommended: true
    }
  ],
  Stop: [
    {
      id: 'final-persist',
      name: 'Final State Persistence',
      description: 'Saves final session state when Claude Code exits',
      script: 'persist-session-state.cjs',
      once: false,
      recommended: false
    }
  ]
};

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
  console.log('\n' + '═'.repeat(60));
  console.log('  🔧 CLAUDE CODE GLOBAL HOOKS SETUP');
  console.log('  Configure automatic hooks for all sessions');
  console.log('═'.repeat(60) + '\n');
}

function printHookInfo(hook, index, selected) {
  const checkbox = selected ? '[✓]' : '[ ]';
  const rec = hook.recommended ? ' (Recommended)' : '';
  const once = hook.once ? ' [runs once]' : ' [runs every tool]';

  console.log(`  ${checkbox} ${index}. ${hook.name}${rec}`);
  console.log(`      ${hook.description}`);
  console.log(`      Script: ${hook.script}${once}`);
  console.log();
}

async function selectHooks(hookType, hooks) {
  const selected = new Set(hooks.filter(h => h.recommended).map(h => h.id));

  while (true) {
    clearScreen();
    printHeader();
    console.log(`📋 ${hookType} Hooks\n`);
    console.log('These hooks run ' + (hookType === 'PreToolUse' ? 'BEFORE' : hookType === 'PostToolUse' ? 'AFTER' : 'WHEN') + ' each tool execution.\n');

    hooks.forEach((hook, i) => {
      printHookInfo(hook, i + 1, selected.has(hook.id));
    });

    console.log('-'.repeat(60));
    console.log('Commands: [number] toggle, [a] select all, [n] select none, [d] done\n');

    const answer = await question('> ');

    if (answer.toLowerCase() === 'd' || answer.toLowerCase() === 'done') {
      break;
    } else if (answer.toLowerCase() === 'a' || answer.toLowerCase() === 'all') {
      hooks.forEach(h => selected.add(h.id));
    } else if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'none') {
      selected.clear();
    } else {
      const num = parseInt(answer);
      if (num >= 1 && num <= hooks.length) {
        const hook = hooks[num - 1];
        if (selected.has(hook.id)) {
          selected.delete(hook.id);
        } else {
          selected.add(hook.id);
        }
      }
    }
  }

  return hooks.filter(h => selected.has(h.id));
}

async function runQuickSetup() {
  clearScreen();
  printHeader();

  console.log('📦 QUICK SETUP OPTIONS\n');
  console.log('  1. Minimal (Recommended)');
  console.log('     Session init + Baseline capture + Crash recovery');
  console.log('     Best for most users\n');
  console.log('  2. Full');
  console.log('     All hooks enabled including model tracking');
  console.log('     Best for detailed auditing\n');
  console.log('  3. Custom');
  console.log('     Choose individual hooks\n');
  console.log('  4. None');
  console.log('     Disable all global hooks\n');
  console.log('  5. Exit');
  console.log('     Cancel without changes\n');

  const answer = await question('Select option [1-5]: ');

  switch (answer) {
    case '1':
      return {
        PreToolUse: AVAILABLE_HOOKS.PreToolUse.filter(h => h.recommended),
        PostToolUse: AVAILABLE_HOOKS.PostToolUse.filter(h => h.recommended),
        Stop: []
      };
    case '2':
      return {
        PreToolUse: AVAILABLE_HOOKS.PreToolUse,
        PostToolUse: AVAILABLE_HOOKS.PostToolUse,
        Stop: AVAILABLE_HOOKS.Stop
      };
    case '3':
      return null; // Signal to run custom setup
    case '4':
      return { PreToolUse: [], PostToolUse: [], Stop: [] };
    case '5':
    default:
      return 'exit';
  }
}

async function runCustomSetup() {
  const selectedHooks = {
    PreToolUse: await selectHooks('PreToolUse', AVAILABLE_HOOKS.PreToolUse),
    PostToolUse: await selectHooks('PostToolUse', AVAILABLE_HOOKS.PostToolUse),
    Stop: await selectHooks('Stop', AVAILABLE_HOOKS.Stop)
  };
  return selectedHooks;
}

function buildHooksConfig(selectedHooks) {
  const config = {};

  for (const [hookType, hooks] of Object.entries(selectedHooks)) {
    if (hooks.length > 0) {
      config[hookType] = hooks.map(hook => {
        const entry = {
          command: `node ${HOOKS_DIR}/${hook.script}`
        };
        if (hook.once) {
          entry.once = true;
        }
        return entry;
      });
    }
  }

  return config;
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    }
  } catch (error) {
    console.error('Warning: Could not load existing settings:', error.message);
  }
  return {};
}

function saveSettings(settings) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

async function confirmAndSave(hooksConfig) {
  clearScreen();
  printHeader();

  console.log('📋 CONFIGURATION SUMMARY\n');

  let totalHooks = 0;
  for (const [hookType, hooks] of Object.entries(hooksConfig)) {
    if (hooks && hooks.length > 0) {
      console.log(`${hookType}:`);
      hooks.forEach(h => {
        const once = h.once ? ' (once)' : '';
        console.log(`  • ${h.command}${once}`);
        totalHooks++;
      });
      console.log();
    }
  }

  if (totalHooks === 0) {
    console.log('  No hooks will be enabled.\n');
  }

  console.log('-'.repeat(60));
  const answer = await question('\nSave this configuration? [Y/n]: ');

  if (answer.toLowerCase() !== 'n' && answer.toLowerCase() !== 'no') {
    const settings = loadSettings();
    settings.hooks = hooksConfig;
    saveSettings(settings);

    console.log('\n✅ Configuration saved to .claude/settings.json');
    console.log('\n📍 Hooks will be active on your next Claude Code session.');

    if (totalHooks > 0) {
      console.log('\n💡 Quick commands:');
      console.log('   • Recover from crash: node scripts/hooks/recover-session-state.cjs');
      console.log('   • Compare baseline:   node scripts/hooks/compare-test-baseline.cjs');
    }

    return true;
  }

  console.log('\n❌ Configuration not saved.');
  return false;
}

async function main() {
  try {
    let selectedHooks = await runQuickSetup();

    if (selectedHooks === 'exit') {
      console.log('\nSetup cancelled.\n');
      rl.close();
      return;
    }

    if (selectedHooks === null) {
      selectedHooks = await runCustomSetup();
    }

    const hooksConfig = buildHooksConfig(selectedHooks);
    await confirmAndSave(hooksConfig);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { AVAILABLE_HOOKS, buildHooksConfig };
