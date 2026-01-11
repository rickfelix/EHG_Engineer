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

**If SD just completed (LEAD-FINAL-APPROVAL passed):**
```
✅ Servers restarted

📋 Post-Restart Checklist:
1. Visual review - Open http://localhost:8080 and verify UI
2. Then run /ship - Create PR and merge your work
```

**If starting fresh work:**
```
✅ Servers restarted

💡 Ready to work:
   • /leo next - See SD queue and pick next work
   • /leo status - Check current SD progress
```

**If context is high (>70%):**
```
✅ Servers restarted

💡 Context is at XX%. Consider:
   • /context-compact - Summarize and reduce context
   • Start fresh session if >85%
```

### When to Use /restart

| Scenario | Suggest /restart | Why |
|----------|------------------|-----|
| Before `/ship` with UI changes | Yes | Verify renders in clean environment |
| After LEAD-FINAL-APPROVAL | Yes (if UI) | Fresh state for visual verification |
| Long session (>2 hours) | Yes | Prevents stale server state |
| After major implementation | Yes | Ensure changes are reflected |
| Quick-fix or small changes | Optional | Usually not needed |
