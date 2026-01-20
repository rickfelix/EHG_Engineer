# LEO Command Reference

Documentation for LEO Protocol commands and the command ecosystem.

## Command Overview

LEO Protocol includes intelligent slash commands that interconnect based on workflow context.

## Key Commands

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/leo` | Protocol orchestrator | Start work, SD management |
| `/restart` | Restart LEO stack | Before UI testing |
| `/ship` | Commit and PR workflow | After implementation |
| `/learn` | Self-improvement | After shipping |
| `/document` | Update documentation | After feature work |
| `/quick-fix` | Small bug fixes | After triangulation |
| `/triangulation-protocol` | Ground-truth verification | Before fixes |
| `/uat` | User acceptance testing | After implementation |

## Command Ecosystem Flow

```
LEAD-FINAL-APPROVAL
        ↓
    /restart (for UI work)
        ↓
   Visual Review
        ↓
      /ship
        ↓
    /document
        ↓
      /learn
        ↓
   /leo next
```

## Running Commands

Commands can be invoked:
- Directly in conversation: `/ship`
- With arguments: `/ship -m "commit message"`
- Via npm: `npm run ship`

---

*Back to [LEO Hub](../README.md)*
