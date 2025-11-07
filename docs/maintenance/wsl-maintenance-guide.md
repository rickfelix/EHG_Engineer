# WSL Maintenance Guide

**Created**: 2025-11-04
**Purpose**: Prevent automatic WSL shutdowns and maintain system stability

## Issue Summary

WSL was experiencing repeated automatic shutdowns due to default idle timeout settings. Evidence:
- Corrupted journal files indicating unclean shutdowns
- System uptime of only 1 minute
- No `.wslconfig` file (using defaults)
- No memory pressure or resource issues

## Solution Implemented

Created `.wslconfig` file at `C:\Users\rickf\.wslconfig` with:
- `vmIdleTimeout=-1` - Disables automatic shutdown
- `autoMemoryReclaim=disabled` - Prevents aggressive memory reclaim
- `memory=12GB` - Allocates 12GB to WSL (75% of 16GB total)
- `processors=6` - Allocates 6 CPU cores
- `swap=4GB` - Provides additional memory headroom

## Applying the Configuration

### Step 1: Shutdown WSL
From **Windows PowerShell or Command Prompt** (not WSL terminal):
```powershell
wsl --shutdown
```

### Step 2: Verify Shutdown
Wait 5-10 seconds, then check status:
```powershell
wsl --status
```

### Step 3: Restart WSL
Simply open a new WSL terminal or run:
```powershell
wsl
```

### Step 4: Verify Configuration Applied
Inside WSL, check system resources:
```bash
# Check uptime (should start from 0)
uptime

# Check memory allocation
free -h

# Verify memory matches config (should show ~12GB total)
cat /proc/meminfo | grep MemTotal
```

## Verification Checklist

After applying the configuration, verify:

- [ ] WSL restarts cleanly
- [ ] Memory shows ~12GB total (not 16GB, confirming config is applied)
- [ ] System stays running for 30+ minutes without auto-shutdown
- [ ] No new corrupted journal file warnings in `dmesg`
- [ ] Docker Desktop continues to work normally

## Monitoring Commands

### Check WSL Status (from Windows)
```powershell
# View WSL version and status
wsl --status

# List all WSL distributions
wsl --list --verbose

# Check WSL version
wsl --version
```

### Monitor WSL Health (inside WSL)
```bash
# Check uptime (should be increasing, not resetting to 0-1 min)
uptime

# Monitor memory usage
free -h

# Check for shutdown warnings
dmesg | grep -i "shutdown\|killed\|oom"

# Check journal for clean shutdowns
journalctl --no-pager -n 50 | grep -i shutdown

# Monitor disk space
df -h
```

## Maintenance Schedule

### Daily
- Monitor uptime to ensure no unexpected restarts
- Check if any processes are consuming excessive memory

### Weekly
- Review journal logs for any warnings
- Check disk space usage
- Verify Docker Desktop is running properly

### Monthly
- **Planned WSL restart** - For applying updates and clearing memory:
  ```bash
  # From WSL, save all work, then exit
  exit

  # From Windows PowerShell
  wsl --shutdown

  # Wait 10 seconds, then restart
  wsl
  ```
- Review `.wslconfig` settings and adjust if needed
- Check for WSL updates: `wsl --update`

## Troubleshooting

### WSL Still Shutting Down?

1. **Verify .wslconfig exists**:
   ```bash
   cat /mnt/c/Users/rickf/.wslconfig
   ```

2. **Check if settings applied**:
   ```bash
   free -h  # Should show ~12GB, not 16GB
   ```

3. **Check Windows Event Viewer** (from Windows):
   - Press Win+X, select "Event Viewer"
   - Navigate to: Windows Logs > System
   - Look for WSL or Hyper-V related errors

4. **Check Windows memory pressure**:
   - Open Task Manager (Ctrl+Shift+Esc)
   - Check if Windows RAM usage is high (>90%)
   - Close unnecessary Windows applications

5. **Docker Desktop interference**:
   ```bash
   # Check if docker-desktop is consuming resources
   wsl --list --verbose

   # If needed, restart Docker Desktop from Windows
   ```

### Memory Issues

If you see OOM (Out of Memory) errors:
```bash
# Check current memory usage
free -h
ps aux --sort=-%mem | head -20

# Consider increasing swap in .wslconfig
# Edit: /mnt/c/Users/rickf/.wslconfig
# Change: swap=4GB to swap=8GB
```

### Performance Issues

If WSL feels slow after changes:
```bash
# Check CPU usage
top -bn1 | head -20

# Check disk I/O
iostat -x 2 5

# Consider adjusting .wslconfig:
# - Increase processors if CPU bound
# - Increase memory if swapping heavily
```

## Advanced Configuration

### Optional .wslconfig Settings

```ini
# Limit WSL to specific CPU cores (0-indexed)
# processorList=0,1,2,3,4,5

# Set page reporting (can reduce memory usage)
# pageReporting=true

# Enable localhost forwarding (access WSL services from Windows)
# localhostForwarding=true

# Set DNS tunneling mode
# dnsTunneling=true

# Set firewall mode
# firewall=true
```

### Emergency Shutdown

If WSL becomes unresponsive:
```powershell
# Force shutdown (from Windows PowerShell as Administrator)
wsl --shutdown

# If that doesn't work, terminate the process
Get-Process -Name "wsl*" | Stop-Process -Force

# Or restart WSL service
Restart-Service -Name "LxssManager"
```

## Resources

- [WSL Configuration Documentation](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
- [WSL Troubleshooting Guide](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting)
- [WSL Best Practices](https://learn.microsoft.com/en-us/windows/wsl/best-practices)

## Change Log

### 2025-11-04
- **Issue**: WSL experiencing repeated automatic shutdowns
- **Root Cause**: Default `vmIdleTimeout` setting causing automatic shutdowns
- **Fix**: Created `.wslconfig` with `vmIdleTimeout=-1` and `autoMemoryReclaim=disabled`
- **Status**: Pending verification (needs WSL restart to apply)
