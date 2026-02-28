---
category: guide
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [guide, auto-generated]
---
# LEO Protocol Command Center - Dashboard Guide



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Features](#features)
  - [Left Sidebar](#left-sidebar)
  - [Main Terminal](#main-terminal)
  - [Quick Actions](#quick-actions)
  - [Live Activity Feed](#live-activity-feed)
- [Installation](#installation)
- [Usage](#usage)
  - [Starting the Dashboard](#starting-the-dashboard)
  - [Stopping the Dashboard](#stopping-the-dashboard)
  - [Other Commands](#other-commands)
- [Configuration](#configuration)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Working with Claude Code](#working-with-claude-code)
- [Typical Workflow](#typical-workflow)
- [Troubleshooting](#troubleshooting)
  - [Dashboard won't start](#dashboard-wont-start)
  - [Terminal not working](#terminal-not-working)
  - [Can't connect to WebSocket](#cant-connect-to-websocket)
  - [Performance issues](#performance-issues)
- [Architecture](#architecture)
- [Security](#security)
- [Performance](#performance)
- [Future Enhancements](#future-enhancements)
- [Support](#support)

## Metadata
- **Category**: Guide
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-18
- **Tags**: api, testing, security, feature

## Overview

The LEO Protocol Command Center is a web-based dashboard that provides a visual interface for managing the EHG_Engineer development workflow while maintaining full terminal access for Claude Code.

## Features

### Left Sidebar
- **LEO Status**: Current role, SD, task, and phase
- **Metrics**: Test results, coverage, Vision QA sessions
- **Recent Files**: Quick access to recently modified files
- **Git Status**: Branch, changes, and commit info

### Main Terminal
- Full terminal emulation using xterm.js
- All commands work exactly as in regular terminal
- Claude Code can use it normally
- Syntax highlighting and clickable links

### Quick Actions
- **Validate SD**: Run Strategic Directive validator
- **Validate PRD**: Run Product Requirements validator
- **Run Tests**: Execute test suite
- **Vision QA**: Launch Vision QA testing
- **Git Status**: Check repository status
- **Push + Monitor**: Push code and monitor CI/CD

### Live Activity Feed
- Real-time updates of file changes
- Test results
- Git operations
- Error/success notifications

## Installation

```bash
# Install dependencies (one-time setup)
npm run dashboard:install

# Or manually:
npm install express ws node-pty cors chokidar
```

## Usage

### Starting the Dashboard

```bash
# Using npm script
npm run dashboard:start

# Or using the CLI directly
./scripts/leo-dashboard.js start

# Or
node scripts/leo-dashboard.js start
```

The dashboard will automatically open in your browser at `http://localhost:3000`

### Stopping the Dashboard

```bash
npm run dashboard:stop

# Or
./scripts/leo-dashboard.js stop
```

### Other Commands

```bash
# Check if dashboard is running
./scripts/leo-dashboard.js status

# Restart dashboard
./scripts/leo-dashboard.js restart

# Open in browser (if already running)
./scripts/leo-dashboard.js open

# Edit configuration
./scripts/leo-dashboard.js config
```

## Configuration

Edit `dashboard-config.json` to customize:

```json
{
  "port": 3000,           // Dashboard port
  "autoOpen": true,       // Auto-open in browser
  "terminal": {
    "shell": "/bin/bash",
    "fontSize": 14,
    "theme": "dark"
  },
  "dashboard": {
    "refreshInterval": 5000,
    "showMetrics": true,
    "showActivityFeed": true
  }
}
```

## Keyboard Shortcuts

- **Alt+1**: Validate Strategic Directive
- **Alt+2**: Validate PRD
- **Alt+3**: Run Tests
- **Alt+C**: Clear Terminal
- **Alt+A**: Toggle Activity Feed

## Working with Claude Code

The dashboard is designed to complement Claude Code, not replace it:

1. **Terminal Pass-Through**: All terminal commands work normally
2. **No Interference**: Dashboard runs separately on port 3000
3. **Optional Use**: Can be closed anytime without affecting Claude Code
4. **Visual Context**: Provides at-a-glance status while working

## Typical Workflow

1. Start the dashboard when beginning work:
   ```bash
   npm run dashboard:start
   ```

2. Use Claude Code in the terminal as normal

3. Dashboard automatically updates with:
   - Current LEO role and task
   - Test results
   - File changes
   - Git status

4. Use Quick Actions for common operations

5. Stop dashboard when done:
   ```bash
   npm run dashboard:stop
   ```

## Troubleshooting

### Dashboard won't start
- Check if port 3000 is available
- Ensure dependencies are installed: `npm run dashboard:install`
- Check for existing process: `./scripts/leo-dashboard.js status`

### Terminal not working
- Ensure `node-pty` is installed
- Check shell path in `dashboard-config.json`
- Try restarting: `./scripts/leo-dashboard.js restart`

### Can't connect to WebSocket
- Check firewall settings for localhost:3000
- Ensure dashboard server is running
- Try different browser

### Performance issues
- Increase `refreshInterval` in config
- Reduce `maxHistorySize` for terminal
- Close activity feed when not needed

## Architecture

```
Dashboard (Port 3000)
├── Express Server      # API and static files
├── WebSocket Server    # Real-time updates
├── Terminal Bridge     # node-pty integration
└── File Watchers       # Monitor changes

↕️ WebSocket

Browser Client
├── xterm.js Terminal   # Terminal emulation
├── Status Panels       # LEO/Git/Metrics
└── Activity Feed       # Live updates
```

## Security

- **Local Only**: Server binds to 127.0.0.1
- **No External Access**: Not accessible from network
- **Read-Only Options**: Can disable terminal input
- **Safe Commands**: Quick actions use safe, predefined commands

## Performance

- **Lightweight**: ~50MB RAM for server
- **Fast Updates**: < 100ms WebSocket latency
- **Cached Metrics**: 5-second cache for efficiency
- **Debounced**: File changes debounced to 500ms

## Future Enhancements

- Multi-tab terminals
- More metrics visualization
- Test result details
- Git diff viewer

## Support

For issues or questions:
1. Check this guide
2. Review `dashboard-config.json`
3. Check server logs: `./scripts/leo-dashboard.js logs`
4. Restart if needed: `./scripts/leo-dashboard.js restart`