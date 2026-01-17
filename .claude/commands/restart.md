# Restart Command

Restart all LEO Stack servers.

## Instructions

Run the LEO stack restart script:

```bash
bash scripts/leo-stack.sh restart
```

This restarts all three servers:
- EHG_Engineer (port 3000)
- EHG App (port 8080)
- Agent Platform (port 8000)

After running, confirm the status shows all servers running.

## Command Ecosystem Integration

### Cross-Reference

This command is part of the **Command Ecosystem**. For full workflow context, see:
- **[Command Ecosystem Reference](../../docs/reference/command-ecosystem.md)** - Complete inter-command flow diagram and relationships

---

The `/restart` command connects to other commands in the workflow:

### Post-Restart Suggestions

**If SD requires UAT (feature, bugfix, security, refactor, enhancement) - Use AskUserQuestion:**

```javascript
{
  "question": "Servers restarted. Ready for User Acceptance Testing?",
  "header": "Post-Restart",
  "multiSelect": false,
  "options": [
    {"label": "/uat (Recommended)", "description": "Run human acceptance testing before shipping"},
    {"label": "Skip UAT, /ship", "description": "Ship without formal UAT (not recommended for features)"},
    {"label": "/leo next", "description": "Check SD queue first"},
    {"label": "Done for now", "description": "End session"}
  ]
}
```

**If SD is infrastructure/database/docs (UAT exempt) - Use AskUserQuestion:**

```javascript
{
  "question": "Servers restarted. Ready for visual review?",
  "header": "Post-Restart",
  "multiSelect": false,
  "options": [
    {"label": "Visual review done, /ship", "description": "Proceed to shipping workflow"},
    {"label": "/leo next", "description": "Check SD queue first"},
    {"label": "Done for now", "description": "End session"}
  ]
}
```

**If starting fresh work - Use AskUserQuestion:**

```javascript
{
  "question": "Servers restarted. What would you like to do?",
  "header": "Next Step",
  "multiSelect": false,
  "options": [
    {"label": "/leo next", "description": "See SD queue and pick next work"},
    {"label": "/leo status", "description": "Check current SD progress"},
    {"label": "Done for now", "description": "End session"}
  ]
}
```

**Auto-invoke behavior:** When user selects a command option, immediately invoke that skill using the Skill tool.

### When to Use /restart

| Scenario | Suggest /restart | Why |
|----------|------------------|-----|
| Before `/uat` for feature SDs | Yes | Clean environment for UAT testing |
| Before `/ship` with UI changes | Yes | Verify renders in clean environment |
| After LEAD-FINAL-APPROVAL | Yes (if UI) | Fresh state for visual verification |
| Long session (>2 hours) | Yes | Prevents stale server state |
| After major implementation | Yes | Ensure changes are reflected |
| Quick-fix or small changes | Optional | Usually not needed |

### Typical Flow After /restart

```
/restart → /uat → /ship → /document → /learn
```

For UAT-requiring SDs (feature, bugfix, security, refactor, enhancement), always suggest /uat before /ship.
