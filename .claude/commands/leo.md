---
description: LEO stack management and session control
argument-hint: [start|restart|stop|status|next]
---

# LEO Stack Control

**Command:** /leo $ARGUMENTS

## Instructions

Based on the argument provided, execute the appropriate action:

### If argument is "start" or "s":
Run the LEO stack start command:
```bash
bash scripts/leo-stack.sh start
```

### If argument is "restart" or "r":
Run the LEO stack restart command:
```bash
bash scripts/leo-stack.sh restart
```

### If argument is "stop" or "x":
Run the LEO stack stop command:
```bash
bash scripts/leo-stack.sh stop
```

### If argument is "status" or "st":
Run the LEO stack status command:
```bash
bash scripts/leo-stack.sh status
```

### If argument is "next" or "n":
Show the SD queue to determine what to work on next:
```bash
npm run sd:next
```

### If argument is "fast" or "f":
Run fast restart (reduced delays):
```bash
bash scripts/leo-stack.sh restart --fast
```

### If no argument provided:
Run the LEO protocol workflow:
```bash
npm run leo
```

### If argument is "help" or "h":
Display this menu to the user:

```
LEO Commands:
  /leo          - Run LEO protocol workflow (npm run leo)
  /leo start    (s)  - Start all LEO servers
  /leo restart  (r)  - Restart all LEO servers
  /leo stop     (x)  - Stop all LEO servers
  /leo status   (st) - Check server status
  /leo next     (n)  - Show SD queue (what to work on)
  /leo fast     (f)  - Fast restart (reduced delays)
  /leo help     (h)  - Show this menu

Shortcuts: /restart = restart servers, /leo n = next
```

Then ask the user which action they'd like to take.

## Context
- Engineer runs on port 3000
- App runs on port 8080
- Agent Platform runs on port 8000
- Stack script: scripts/leo-stack.sh
