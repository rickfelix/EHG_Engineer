<!-- reasoning_effort: low -->

---
description: "View and modify LEO session settings (AUTO-PROCEED, Orchestrator Chaining). Use when user says /leo settings or needs to change session configuration."
---

<!-- GENERATED: hash=9ddd4dbe5907 timestamp=2026-04-03T19:00:30.243Z sections=1 -->

# LEO Settings — View and Modify Session Configuration

**Purpose**: Display and modify AUTO-PROCEED and Orchestrator Chaining settings.
This skill handles global defaults, session overrides, and settings display.
All database queries use canonical scripts.

## Quick Reference
```
/leo settings     — View and modify settings
```

## Settings Protocol

### LEO Settings Skill

### Step 1: Query Current Settings

Run the canonical settings script to get current values:
```bash
node scripts/leo-settings.js view
```

Parse the output for GLOBAL_AUTO_PROCEED, GLOBAL_CHAIN, SESSION_AUTO_PROCEED, SESSION_CHAIN values.

### Step 2: Display Current Settings

Present to the user:
```
LEO Settings

Global Defaults (apply to new sessions):
   Auto-Proceed: [GLOBAL_AUTO_PROCEED value]
   Orchestrator Chaining: [GLOBAL_CHAIN value]

Current Session:
   Auto-Proceed: [SESSION_AUTO_PROCEED value] (or "inherited from global")
   Orchestrator Chaining: [SESSION_CHAIN value] (or "inherited from global")

Precedence: CLI flags > Session > Global > Default
```

### Step 3: Ask What to Configure

Use AskUserQuestion with options:
- "Change session settings" — Modify for THIS session only
- "Change global defaults" — Modify for ALL future sessions
- "View only" — Just display, no changes

### Step 4a: Change Session Settings

Ask about both Auto-Proceed and Chaining preferences using AskUserQuestion, then run:
```bash
node scripts/leo-settings.js session <true|false> <true|false>
```

### Step 4b: Change Global Defaults

Ask using AskUserQuestion for preferences, then run:
```bash
node scripts/leo-settings.js global <true|false> <true|false>
```

### Step 5: Display Confirmation

Show updated settings. Note: "Session settings override global defaults. New sessions inherit from global defaults."

## Settings Precedence
CLI flags > Session overrides > Global defaults > Hard-coded defaults

## Anti-Drift Rules
1. ALWAYS query current settings before displaying (never assume values)
2. ALWAYS use AskUserQuestion for configuration changes
3. NEVER modify settings without user confirmation
4. Session settings override global defaults — display which layer is active
