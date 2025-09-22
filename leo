#!/usr/bin/env node
// LEO Quick Access - Auto-updates CLAUDE.md
require('./scripts/leo-auto-init.js').LEOAutoInit().initialize().then(() => {
  require('./scripts/leo.js');
});