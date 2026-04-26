# Capture-Window: non-invasive window screenshot via PrintWindow
#
# Captures a process's main window content WITHOUT bringing it to focus,
# moving it, or resizing it. Works on background/occluded windows.
# Uses PW_RENDERFULLCONTENT (flag=2) so Chromium-based apps (Edge/Chrome) render correctly.
#
# Usage:
#   pwsh -File scripts/capture-window.ps1 -Title edge
#   pwsh -File scripts/capture-window.ps1 -Title 'LexiGuard|Exec Holdings'
#   pwsh -File scripts/capture-window.ps1 -Process msedge
#   pwsh -File scripts/capture-window.ps1 -List           # enumerate matching windows
#   pwsh -File scripts/capture-window.ps1 -Hwnd 460656
#   pwsh -File scripts/capture-window.ps1 -Title edge -Tag s17-pngs
#
# Output: prints the saved PNG path on stdout (last line). Diagnostics on stderr/Verbose.

[CmdletBinding(DefaultParameterSetName='ByQuery')]
param(
  [Parameter(ParameterSetName='ByQuery')] [string]$Title,
  [Parameter(ParameterSetName='ByQuery')] [string]$Process,
  [Parameter(ParameterSetName='ByHwnd')]  [int]$Hwnd,
  [Parameter(ParameterSetName='List')]    [switch]$List,
  [string]$OutDir = ".playwright-shots",
  [string]$Tag,
  [switch]$Quiet
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CW {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out RECT r, int sz);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
}
"@

function Get-CandidateWindows {
  $procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle }
  $results = foreach ($p in $procs) {
    [pscustomobject]@{
      Hwnd        = [int64]$p.MainWindowHandle
      Title       = $p.MainWindowTitle
      ProcessName = $p.ProcessName
      ProcessId   = $p.Id
      Iconic      = [CW]::IsIconic($p.MainWindowHandle)
    }
  }
  return $results
}

function Sanitize([string]$s) {
  if (-not $s) { return 'window' }
  $clean = ($s -replace '[^A-Za-z0-9._-]+', '-').Trim('-')
  if ($clean.Length -gt 40) { $clean = $clean.Substring(0, 40) }
  if ([string]::IsNullOrWhiteSpace($clean)) { return 'window' }
  return $clean.ToLower()
}

$all = Get-CandidateWindows

if ($List) {
  $filtered = $all
  if ($Title)   { $filtered = $filtered | Where-Object { $_.Title -match $Title } }
  if ($Process) { $filtered = $filtered | Where-Object { $_.ProcessName -match $Process } }
  $filtered | Sort-Object ProcessName, Title | Format-Table -AutoSize Hwnd, ProcessId, ProcessName, Iconic, Title
  return
}

$targets = $all
if ($Hwnd -ne 0) {
  $targets = $all | Where-Object { $_.Hwnd -eq [int64]$Hwnd }
} else {
  if ($Title)   { $targets = $targets | Where-Object { $_.Title -match $Title } }
  if ($Process) { $targets = $targets | Where-Object { $_.ProcessName -match $Process } }
}

$targets = @($targets)
if ($targets.Count -eq 0) {
  Write-Error "No visible windows match (Title='$Title' Process='$Process' Hwnd=$Hwnd). Run with -List to see candidates."
  exit 2
}
if ($targets.Count -gt 1 -and -not $Quiet) {
  Write-Warning ("{0} matches; using first non-minimized. Pass -Hwnd <id> to disambiguate." -f $targets.Count)
}

$picked = $targets | Where-Object { -not $_.Iconic } | Select-Object -First 1
if (-not $picked) { $picked = $targets | Select-Object -First 1 }

if ($picked.Iconic) {
  Write-Error "Target window is minimized (iconic). PrintWindow on a minimized window returns blank -- restore it first."
  exit 3
}

$h = [IntPtr]$picked.Hwnd
$r = New-Object CW+RECT
$dwm = [CW]::DwmGetWindowAttribute($h, 9, [ref]$r, 16)  # 9 = DWMWA_EXTENDED_FRAME_BOUNDS
if ($dwm -ne 0) { [CW]::GetWindowRect($h, [ref]$r) | Out-Null }
$w  = $r.R - $r.L
$hh = $r.B - $r.T
if ($w -le 0 -or $hh -le 0) {
  Write-Error "Invalid window rect (W=$w H=$hh)"
  exit 4
}

$ts = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$tagPart = if ($Tag) { Sanitize $Tag } else { Sanitize $picked.Title }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
$out = Join-Path $OutDir ("{0}-{1}.png" -f $tagPart, $ts)

$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g   = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok  = [CW]::PrintWindow($h, $hdc, 2)  # PW_RENDERFULLCONTENT for Chromium-based apps
$g.ReleaseHdc($hdc)
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

if (-not $ok) {
  Write-Warning "PrintWindow returned false; saved image may be blank."
}
if (-not $Quiet) {
  $msg = "Captured: HWND=" + $picked.Hwnd + " Pid=" + $picked.ProcessId + " Proc=" + $picked.ProcessName + " " + $w + "x" + $hh + " Title=" + $picked.Title
  Write-Host $msg -ForegroundColor Cyan
}
Write-Output $out
