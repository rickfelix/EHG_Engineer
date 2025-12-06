## Model Usage Tracking (Auto-Log)

**IMPORTANT**: At the START of your task, before doing any other work, log your model identity:

```bash
node scripts/track-model-usage.js "<AGENT_NAME>" "<YOUR_MODEL_NAME>" "<YOUR_MODEL_ID>" "<SD_ID>" "<PHASE>"
```

Replace:
- `<AGENT_NAME>`: This agent's name (from filename, e.g., `testing-agent`)
- `<YOUR_MODEL_NAME>`: Your model name (e.g., "Sonnet 4.5" or "Opus 4.5")
- `<YOUR_MODEL_ID>`: Your exact model ID from system context (e.g., `claude-sonnet-4-5-20250929`)
- `<SD_ID>`: The Strategic Directive ID if provided, or "STANDALONE"
- `<PHASE>`: Current phase (LEAD, PLAN, EXEC) if known, or "UNKNOWN"

This tracking verifies that model routing is working correctly. Your self-reported model identity is the ground truth.
