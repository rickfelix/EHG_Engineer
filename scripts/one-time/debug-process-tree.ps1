param([int]$RootPid = 12872)

function Show-Children {
  param([int]$ParentPid, [int]$Depth = 0)
  $indent = "  " * $Depth
  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$ParentPid" -ErrorAction SilentlyContinue
  foreach ($c in $children) {
    $cmd = if ($c.CommandLine.Length -gt 120) { $c.CommandLine.Substring(0, 120) + "..." } else { $c.CommandLine }
    Write-Output "${indent}PID=$($c.ProcessId) Name=$($c.Name) PPID=$ParentPid Cmd=$cmd"
    if ($Depth -lt 8) {
      Show-Children -ParentPid $c.ProcessId -Depth ($Depth + 1)
    }
  }
}

Write-Output "=== Process tree from PID $RootPid ==="
$root = Get-CimInstance Win32_Process -Filter "ProcessId=$RootPid" -ErrorAction SilentlyContinue
if ($root) {
  $cmd = if ($root.CommandLine.Length -gt 120) { $root.CommandLine.Substring(0, 120) + "..." } else { $root.CommandLine }
  Write-Output "ROOT: PID=$($root.ProcessId) Name=$($root.Name) PPID=$($root.ParentProcessId) Cmd=$cmd"
} else {
  Write-Output "ROOT PID $RootPid not found!"
}
Show-Children -ParentPid $RootPid
