' QF-20260902-191: hidden-window launcher for the three PID-capable host tasks
' (EHG EVA Scheduler Watcher, EHG LEO Liveness Watcher, EHG LEO Stale-Session
' Sweep) -- their Scheduled Task actions already point at this exact path
' (wscript.exe //B run-hidden.vbs <task>.cmd), so re-adding it here restores
' all three without re-registering any task. Must stay TRACKED: it was
' previously an untracked host-only file that went missing, taking the whole
' venue down (LastTaskResult=1 on all three) until this fix.
'
' Runs its first argument (a .cmd path) with window style 0 (hidden), and
' does not wait for it to exit -- matches every existing task's expectation
' of a fire-and-forget hidden launch.
CreateObject("WScript.Shell").Run Chr(34) & WScript.Arguments(0) & Chr(34), 0, False
