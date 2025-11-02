#!/bin/bash
# LEO Stack Management Script - Enhanced Resilient Version
# Manages all three servers in the LEO Stack with WSL crash prevention
#   - EHG_Engineer (port 3000): LEO Protocol Framework & Backend API
#   - EHG App (port 8080): Frontend UI & User Interface
#   - Agent Platform (port 8000): AI Research Backend for Venture Creation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Enhanced safety thresholds
MIN_FREE_MEMORY_MB=500
MIN_INOTIFY_WATCHES=100000
STARTUP_DELAY=5  # Delay between server starts
SHUTDOWN_GRACE_PERIOD=5  # Increased from 3s
OPERATION_TIMEOUT=30  # Max time for any single operation
RESTART_COOLDOWN=10  # Delay between stop and start phases
WSL_HEALTH_CHECK_INTERVAL=2  # Check WSL health every 2s during operations

# Directories
ENGINEER_DIR="/mnt/c/_EHG/EHG_Engineer"
APP_DIR="/mnt/c/_EHG/ehg"
AGENT_DIR="/mnt/c/_EHG/ehg/agent-platform"

# PID file locations
PID_DIR="$ENGINEER_DIR/.pids"
mkdir -p "$PID_DIR"
ENGINEER_PID="$PID_DIR/engineer.pid"
APP_PID="$PID_DIR/app.pid"
AGENT_PID="$PID_DIR/agent.pid"

# Log directory
LOG_DIR="$ENGINEER_DIR/.logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/leo-stack-$(date +%Y%m%d-%H%M%S).log"

# Lock file to prevent concurrent operations
LOCK_FILE="$PID_DIR/leo-stack.lock"

# Function to log messages to both console and file
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo -e "$message"
    echo "[$timestamp] [$level] $message" | sed 's/\x1b\[[0-9;]*m//g' >> "$LOG_FILE"
}

# Function to acquire lock (prevent concurrent operations)
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$lock_pid" ] && ps -p "$lock_pid" > /dev/null 2>&1; then
            log "ERROR" "${RED}❌ Another LEO stack operation is running (PID: $lock_pid)${NC}"
            log "ERROR" "${YELLOW}   Wait for it to complete or remove lock: rm $LOCK_FILE${NC}"
            exit 1
        else
            log "WARN" "${YELLOW}⚠️  Removing stale lock file${NC}"
            rm "$LOCK_FILE"
        fi
    fi

    echo $$ > "$LOCK_FILE"
    trap "rm -f $LOCK_FILE" EXIT
}

# Function to check WSL health (detect if WSL is becoming unstable)
check_wsl_health() {
    local test_file="/tmp/.wsl-health-$$"

    # Try to write and read a file - if this fails, WSL is unstable
    if ! echo "test" > "$test_file" 2>/dev/null; then
        log "ERROR" "${RED}❌ WSL filesystem unresponsive!${NC}"
        return 1
    fi

    if ! cat "$test_file" > /dev/null 2>&1; then
        log "ERROR" "${RED}❌ WSL filesystem read failure!${NC}"
        return 1
    fi

    rm -f "$test_file"
    return 0
}

# Function to run command with timeout
run_with_timeout() {
    local timeout=$1
    shift
    local cmd="$@"

    log "DEBUG" "${BLUE}Running: $cmd (timeout: ${timeout}s)${NC}"

    # Run command in background
    eval "$cmd" &
    local pid=$!

    # Wait with timeout
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        if ! ps -p $pid > /dev/null 2>&1; then
            # Process completed
            wait $pid 2>/dev/null
            return $?
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    # Timeout reached - kill process
    log "ERROR" "${RED}⚠️  Operation timed out after ${timeout}s${NC}"
    kill -9 $pid 2>/dev/null || true
    return 124  # Timeout exit code
}

# Function to check available memory
check_memory() {
    local free_mem=$(free -m | awk '/^Mem:/{print $7}')
    if [ "$free_mem" -lt "$MIN_FREE_MEMORY_MB" ]; then
        log "WARN" "${RED}⚠️  WARNING: Low memory! Free: ${free_mem}MB (minimum: ${MIN_FREE_MEMORY_MB}MB)${NC}"
        log "WARN" "${YELLOW}   WSL2 may crash if all servers start. Consider:${NC}"
        log "WARN" "${YELLOW}   1. Increasing WSL2 memory in .wslconfig${NC}"
        log "WARN" "${YELLOW}   2. Starting servers individually${NC}"
        log "WARN" "${YELLOW}   3. Closing other applications${NC}"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "INFO" "${RED}Aborted by user${NC}"
            exit 1
        fi
    else
        log "INFO" "${GREEN}✅ Memory check passed: ${free_mem}MB available${NC}"
    fi
}

# Function to check file watcher limits
check_inotify() {
    local max_watches=$(cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || echo "0")
    if [ "$max_watches" -lt "$MIN_INOTIFY_WATCHES" ]; then
        log "WARN" "${YELLOW}⚠️  WARNING: Low inotify watches: $max_watches (recommended: 524288)${NC}"
        log "WARN" "${YELLOW}   Vite may not detect file changes properly${NC}"
        log "WARN" "${YELLOW}   Fix: sudo sysctl fs.inotify.max_user_watches=524288${NC}"
    else
        log "INFO" "${GREEN}✅ File watcher limit: $max_watches${NC}"
    fi
}

# Function to check if a port is in use
port_in_use() {
    lsof -i :$1 -P -n > /dev/null 2>&1
}

# Function to clean up process tree (kills all child processes)
kill_process_tree() {
    local pid=$1
    local signal=${2:-TERM}

    # Get all child PIDs
    local children=$(pgrep -P $pid 2>/dev/null || true)

    # Kill children first (recursively)
    for child in $children; do
        kill_process_tree $child $signal
    done

    # Kill the parent process
    if ps -p $pid > /dev/null 2>&1; then
        log "DEBUG" "${YELLOW}   Sending SIG$signal to PID $pid${NC}"
        kill -$signal $pid 2>/dev/null || true
    fi
}

# Function to clean up duplicate processes on a port (ENHANCED)
clean_port() {
    local port=$1
    local name=$2

    if port_in_use $port; then
        log "INFO" "${YELLOW}🧹 Cleaning up processes on port $port ($name)...${NC}"

        # Get list of PIDs using this port
        local pids=$(lsof -ti:$port 2>/dev/null)

        if [ -n "$pids" ]; then
            local count=$(echo "$pids" | wc -l)
            log "INFO" "${YELLOW}   Found $count process(es) to terminate${NC}"

            # Show what we found
            for pid in $pids; do
                local cmd=$(ps -p $pid -o comm= 2>/dev/null || echo "unknown")
                log "INFO" "${YELLOW}   - PID $pid: $cmd${NC}"
            done

            # Try graceful shutdown first (SIGTERM) with process tree cleanup
            log "INFO" "${YELLOW}   Attempting graceful shutdown (SIGTERM + process tree)...${NC}"
            for pid in $pids; do
                kill_process_tree $pid TERM
            done

            # Wait with WSL health checks
            local waited=0
            while [ $waited -lt $SHUTDOWN_GRACE_PERIOD ]; do
                if ! check_wsl_health; then
                    log "ERROR" "${RED}❌ WSL became unstable during shutdown!${NC}"
                    return 1
                fi

                if ! port_in_use $port; then
                    log "INFO" "${GREEN}   Graceful shutdown successful${NC}"
                    return 0
                fi

                sleep 1
                waited=$((waited + 1))
            done

            # Check if processes are still running
            local remaining_pids=$(lsof -ti:$port 2>/dev/null)
            if [ -n "$remaining_pids" ]; then
                log "WARN" "${YELLOW}   Processes still running, forcing shutdown (SIGKILL + process tree)...${NC}"
                for pid in $remaining_pids; do
                    kill_process_tree $pid KILL
                done
                sleep 2  # Longer wait after SIGKILL
            fi

            # Verify cleanup
            if port_in_use $port; then
                log "ERROR" "${RED}   ⚠️  Warning: Port $port still in use after cleanup${NC}"
                return 1
            else
                log "INFO" "${GREEN}   ✅ Port $port is now free${NC}"
            fi
        fi
    fi

    return 0
}

# Function to clean all ports
clean_all_ports() {
    log "INFO" "${BLUE}🧹 Cleaning up all LEO Stack ports...${NC}"
    echo "=================================="

    local failed=0

    clean_port 3000 "EHG_Engineer" || failed=$((failed + 1))
    sleep 1
    check_wsl_health || return 1

    clean_port 8080 "EHG App" || failed=$((failed + 1))
    sleep 1
    check_wsl_health || return 1

    clean_port 8000 "Agent Platform" || failed=$((failed + 1))

    echo "=================================="

    if [ $failed -gt 0 ]; then
        log "ERROR" "${RED}⚠️  Failed to clean $failed port(s)${NC}"
        return 1
    fi

    log "INFO" "${GREEN}✨ Port cleanup complete!${NC}"
    echo ""
    return 0
}

# Function to start EHG_Engineer server (port 3000)
start_engineer() {
    log "INFO" "${BLUE}🔧 Starting EHG_Engineer server (port 3000)...${NC}"

    # Clean port first if in use
    if port_in_use 3000; then
        log "WARN" "${YELLOW}⚠️  Port 3000 already in use - cleaning up...${NC}"
        clean_port 3000 "EHG_Engineer" || return 1
    fi

    cd "$ENGINEER_DIR"

    # Start with logging to file instead of /dev/null
    local server_log="$LOG_DIR/engineer-$(date +%Y%m%d-%H%M%S).log"
    PORT=3000 node server.js >> "$server_log" 2>&1 &
    local pid=$!
    echo $pid > "$ENGINEER_PID"

    # Verify it started
    sleep 2
    if ! ps -p $pid > /dev/null 2>&1; then
        log "ERROR" "${RED}❌ EHG_Engineer failed to start! Check log: $server_log${NC}"
        return 1
    fi

    log "INFO" "${GREEN}✅ EHG_Engineer server started (PID: $pid)${NC}"
    log "INFO" "   📍 http://localhost:3000"
    log "INFO" "   📋 Log: $server_log"
    return 0
}

# Function to start EHG App frontend (port 8080)
start_app() {
    log "INFO" "${BLUE}🎨 Starting EHG App frontend (port 8080)...${NC}"

    # Clean port first if in use - especially important for Vite which can leave orphaned processes
    if port_in_use 8080; then
        log "WARN" "${YELLOW}⚠️  Port 8080 already in use - cleaning up...${NC}"
        clean_port 8080 "EHG App" || return 1
    fi

    cd "$APP_DIR"

    # Start with logging to file instead of /dev/null
    local app_log="$LOG_DIR/app-$(date +%Y%m%d-%H%M%S).log"
    PORT=8080 npm run dev -- --host 0.0.0.0 >> "$app_log" 2>&1 &
    local pid=$!
    echo $pid > "$APP_PID"

    # Wait for Vite to start
    sleep 3

    # Verify it started
    if ! ps -p $pid > /dev/null 2>&1; then
        log "ERROR" "${RED}❌ EHG App failed to start! Check log: $app_log${NC}"
        return 1
    fi

    log "INFO" "${GREEN}✅ EHG App frontend started (PID: $pid)${NC}"
    log "INFO" "   📍 http://localhost:8080"
    log "INFO" "   📋 Log: $app_log"
    return 0
}

# Function to start Agent Platform backend (port 8000)
start_agent() {
    log "INFO" "${BLUE}🤖 Starting Agent Platform backend (port 8000)...${NC}"

    # Clean port first if in use
    if port_in_use 8000; then
        log "WARN" "${YELLOW}⚠️  Port 8000 already in use - cleaning up...${NC}"
        clean_port 8000 "Agent Platform" || return 1
    fi

    cd "$AGENT_DIR"
    if [ ! -d "venv" ]; then
        log "ERROR" "${YELLOW}⚠️  Virtual environment not found. Run: bash INSTALL.sh${NC}"
        return 1
    fi

    source venv/bin/activate

    # Start with logging to file instead of /dev/null
    local agent_log="$LOG_DIR/agent-$(date +%Y%m%d-%H%M%S).log"
    # Note: --reload disabled due to WSL2/Windows filesystem issues
    # Use restart command to reload after code changes
    uvicorn main:app --host 0.0.0.0 --port 8000 >> "$agent_log" 2>&1 &
    local pid=$!
    echo $pid > "$AGENT_PID"

    # Wait for FastAPI to start (no reload watcher)
    sleep 5

    # Verify it started
    if ! ps -p $pid > /dev/null 2>&1; then
        log "ERROR" "${RED}❌ Agent Platform failed to start! Check log: $agent_log${NC}"
        return 1
    fi

    log "INFO" "${GREEN}✅ Agent Platform backend started (PID: $pid)${NC}"
    log "INFO" "   📍 http://localhost:8000"
    log "INFO" "   📚 API Docs: http://localhost:8000/api/docs"
    log "INFO" "   📋 Log: $agent_log"
    log "INFO" "   ${YELLOW}💡 Tip: Use 'restart' command to reload after code changes${NC}"
    return 0
}

# Function to stop a server by PID file (ENHANCED)
stop_server() {
    local pid_file=$1
    local name=$2

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            log "INFO" "${YELLOW}Stopping $name (PID: $pid)...${NC}"

            # Try graceful shutdown first with process tree cleanup
            log "DEBUG" "${YELLOW}   Using process tree cleanup...${NC}"
            kill_process_tree $pid TERM

            # Wait for graceful shutdown with WSL health monitoring
            local waited=0
            while ps -p $pid > /dev/null 2>&1 && [ $waited -lt $SHUTDOWN_GRACE_PERIOD ]; do
                if ! check_wsl_health; then
                    log "ERROR" "${RED}❌ WSL became unstable during shutdown!${NC}"
                    return 1
                fi
                sleep 1
                waited=$((waited + 1))
            done

            # Force kill if still running
            if ps -p $pid > /dev/null 2>&1; then
                log "WARN" "${YELLOW}   Forcing shutdown with process tree...${NC}"
                kill_process_tree $pid KILL
                sleep 2  # Longer wait after SIGKILL
            fi

            if ps -p $pid > /dev/null 2>&1; then
                log "ERROR" "${RED}⚠️  Failed to stop $name${NC}"
                return 1
            fi

            log "INFO" "${GREEN}✅ Stopped $name${NC}"
        else
            log "WARN" "${YELLOW}⚠️  $name not running (stale PID file)${NC}"
        fi
        rm "$pid_file"
    else
        log "WARN" "${YELLOW}⚠️  $name PID file not found${NC}"
    fi

    return 0
}

# Function to stop all servers (ENHANCED)
stop_all() {
    log "INFO" "${RED}🛑 Stopping all servers (graceful shutdown with WSL protection)...${NC}"
    echo "=================================="

    local failed=0

    # Stop in reverse order (agent -> app -> engineer) with validation between each
    stop_server "$AGENT_PID" "Agent Platform" || failed=$((failed + 1))
    sleep 2
    check_wsl_health || { log "ERROR" "${RED}WSL unstable after stopping Agent Platform${NC}"; return 1; }

    stop_server "$APP_PID" "EHG App" || failed=$((failed + 1))
    sleep 2
    check_wsl_health || { log "ERROR" "${RED}WSL unstable after stopping EHG App${NC}"; return 1; }

    stop_server "$ENGINEER_PID" "EHG_Engineer" || failed=$((failed + 1))
    sleep 2
    check_wsl_health || { log "ERROR" "${RED}WSL unstable after stopping EHG_Engineer${NC}"; return 1; }

    echo "=================================="
    log "INFO" "${YELLOW}Verifying all ports are clear...${NC}"

    # Gracefully clean any remaining processes on the ports
    for port in 3000 8080 8000; do
        if port_in_use $port; then
            log "WARN" "${YELLOW}⚠️  Port $port still in use, attempting final cleanup...${NC}"
            local pids=$(lsof -ti:$port 2>/dev/null)
            if [ -n "$pids" ]; then
                # Try SIGTERM first with process tree
                for pid in $pids; do
                    kill_process_tree $pid TERM
                done
                sleep $SHUTDOWN_GRACE_PERIOD

                # Force kill only if necessary
                if port_in_use $port; then
                    log "WARN" "${YELLOW}   Forcing shutdown on port $port...${NC}"
                    for pid in $(lsof -ti:$port 2>/dev/null); do
                        kill_process_tree $pid KILL
                    done
                    sleep 2
                fi
            fi

            # Final check
            if port_in_use $port; then
                log "ERROR" "${RED}⚠️  Failed to clear port $port${NC}"
                failed=$((failed + 1))
            fi
        fi
    done

    if [ $failed -gt 0 ]; then
        log "ERROR" "${RED}⚠️  Stopped with $failed error(s)${NC}"
        return 1
    fi

    log "INFO" "${GREEN}✅ All servers stopped cleanly${NC}"
    return 0
}

# Function to show server status
status() {
    log "INFO" "${BLUE}📊 Server Status:${NC}"
    echo "=================================="

    check_status() {
        local pid_file=$1
        local port=$2
        local name=$3

        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if ps -p $pid > /dev/null 2>&1; then
                log "INFO" "${GREEN}✅ $name: Running (PID: $pid, Port: $port)${NC}"
            else
                log "INFO" "${RED}❌ $name: Not running (stale PID)${NC}"
            fi
        else
            if port_in_use $port; then
                log "INFO" "${YELLOW}⚠️  $name: Running (no PID file, Port: $port)${NC}"
            else
                log "INFO" "${RED}❌ $name: Not running${NC}"
            fi
        fi
    }

    check_status "$ENGINEER_PID" 3000 "EHG_Engineer (3000)"
    check_status "$APP_PID" 8080 "EHG App (8080)"
    check_status "$AGENT_PID" 8000 "Agent Platform (8000)"
    echo "=================================="

    # Show WSL health
    if check_wsl_health; then
        log "INFO" "${GREEN}✅ WSL Health: Responsive${NC}"
    else
        log "ERROR" "${RED}❌ WSL Health: Unresponsive${NC}"
    fi

    # Show memory
    local free_mem=$(free -m | awk '/^Mem:/{print $7}')
    log "INFO" "${BLUE}📊 Available Memory: ${free_mem}MB${NC}"
}

# Function to start all servers (ENHANCED)
start_all() {
    log "INFO" "${BLUE}🚀 Starting LEO Stack...${NC}"
    echo "=================================="

    # Resource checks before starting
    log "INFO" "${BLUE}Running pre-start checks...${NC}"
    check_memory
    check_inotify
    check_wsl_health || { log "ERROR" "${RED}WSL is unresponsive!${NC}"; return 1; }
    echo "=================================="

    # Clean up any duplicate processes
    clean_all_ports || { log "ERROR" "${RED}Port cleanup failed!${NC}"; return 1; }

    # Start servers sequentially with delays to reduce memory spike
    log "INFO" "${BLUE}Starting servers sequentially (${STARTUP_DELAY}s delay between each)...${NC}"
    echo "=================================="

    start_engineer || { log "ERROR" "${RED}Failed to start EHG_Engineer${NC}"; return 1; }
    log "INFO" "${YELLOW}Waiting ${STARTUP_DELAY}s before starting next server...${NC}"
    sleep $STARTUP_DELAY
    check_wsl_health || { log "ERROR" "${RED}WSL became unstable!${NC}"; return 1; }

    start_app || { log "ERROR" "${RED}Failed to start EHG App${NC}"; return 1; }
    log "INFO" "${YELLOW}Waiting ${STARTUP_DELAY}s before starting next server...${NC}"
    sleep $STARTUP_DELAY
    check_wsl_health || { log "ERROR" "${RED}WSL became unstable!${NC}"; return 1; }

    start_agent || { log "ERROR" "${RED}Failed to start Agent Platform${NC}"; return 1; }

    echo "=================================="
    log "INFO" "${GREEN}✨ LEO Stack startup complete!${NC}"
    log "INFO" "${MAGENTA}📋 Log file: $LOG_FILE${NC}"
    echo ""
    sleep 2  # Brief delay before status check
    status
}

# Function to restart all servers (ENHANCED WITH COOLDOWN)
restart_all() {
    log "INFO" "${BLUE}🔄 Restarting LEO Stack (enhanced safe mode)...${NC}"
    echo "=================================="

    # Stop all servers gracefully
    if ! stop_all; then
        log "ERROR" "${RED}⚠️  Shutdown had errors. Aborting restart for safety.${NC}"
        log "ERROR" "${YELLOW}   Run 'clean' command and try 'start' instead.${NC}"
        return 1
    fi

    # ENHANCED: Longer cooldown period to allow WSL to stabilize
    log "INFO" "${YELLOW}⚠️  COOLDOWN: Waiting ${RESTART_COOLDOWN}s for WSL to stabilize...${NC}"
    local cooldown=0
    while [ $cooldown -lt $RESTART_COOLDOWN ]; do
        echo -n "."
        if ! check_wsl_health; then
            log "ERROR" "${RED}WSL became unstable during cooldown!${NC}"
            return 1
        fi
        sleep 1
        cooldown=$((cooldown + 1))
    done
    echo ""

    # Verify all ports are free
    log "INFO" "${YELLOW}Verifying all ports are clear...${NC}"
    local ports_clear=true
    for port in 3000 8080 8000; do
        if port_in_use $port; then
            log "ERROR" "${RED}⚠️  Port $port still in use after shutdown!${NC}"
            ports_clear=false
        fi
    done

    if [ "$ports_clear" = false ]; then
        log "ERROR" "${RED}⚠️  Not all ports cleared. Aborting restart for safety.${NC}"
        log "ERROR" "${YELLOW}   Run 'clean' command and try 'start' instead.${NC}"
        return 1
    fi

    log "INFO" "${GREEN}✅ All ports verified clear, WSL stable, starting servers...${NC}"
    echo "=================================="

    # Start all servers with resource checks
    start_all
}

# Emergency cleanup mode (last resort)
emergency_cleanup() {
    log "WARN" "${RED}🚨 EMERGENCY CLEANUP MODE${NC}"
    log "WARN" "${YELLOW}This will force-kill all node, npm, and uvicorn processes!${NC}"
    read -p "Are you sure? (yes/NO): " -r
    if [[ ! $REPLY =~ ^yes$ ]]; then
        log "INFO" "Aborted"
        return 0
    fi

    log "WARN" "${RED}Executing emergency cleanup...${NC}"

    # Kill all node processes
    pkill -9 node 2>/dev/null || true
    sleep 2

    # Kill all npm processes
    pkill -9 npm 2>/dev/null || true
    sleep 2

    # Kill all uvicorn processes
    pkill -9 uvicorn 2>/dev/null || true
    sleep 2

    # Clean PID files
    rm -f "$ENGINEER_PID" "$APP_PID" "$AGENT_PID" 2>/dev/null || true

    # Verify ports are clear
    for port in 3000 8080 8000; do
        if port_in_use $port; then
            log "ERROR" "${RED}⚠️  Port $port still in use after emergency cleanup${NC}"
        else
            log "INFO" "${GREEN}✅ Port $port cleared${NC}"
        fi
    done

    log "INFO" "${GREEN}Emergency cleanup complete${NC}"
}

# Main command handler
case "${1:-}" in
    start)
        acquire_lock
        start_all
        ;;
    stop)
        acquire_lock
        stop_all
        ;;
    restart)
        acquire_lock
        restart_all
        ;;
    status)
        status
        ;;
    clean)
        acquire_lock
        clean_all_ports
        ;;
    emergency)
        acquire_lock
        emergency_cleanup
        ;;
    start-engineer)
        acquire_lock
        start_engineer
        ;;
    start-app)
        acquire_lock
        start_app
        ;;
    start-agent)
        acquire_lock
        start_agent
        ;;
    logs)
        log "INFO" "${BLUE}📋 Recent log files:${NC}"
        ls -lht "$LOG_DIR" | head -10
        echo ""
        log "INFO" "${BLUE}Current session log: $LOG_FILE${NC}"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|clean|emergency|start-engineer|start-app|start-agent|logs}"
        echo ""
        echo "Commands:"
        echo "  start            - Check resources, clean ports & start all servers sequentially"
        echo "  stop             - Gracefully stop all servers (SIGTERM → SIGKILL with WSL monitoring)"
        echo "  restart          - SAFE restart: stop → ${RESTART_COOLDOWN}s cooldown → verify → start"
        echo "  status           - Show server status and WSL health"
        echo "  clean            - Clean up duplicate processes on all ports"
        echo "  emergency        - FORCE kill all node/npm/uvicorn processes (last resort)"
        echo "  start-engineer   - Clean & start only EHG_Engineer (3000)"
        echo "  start-app        - Clean & start only EHG App (8080)"
        echo "  start-agent      - Clean & start only Agent Platform (8000)"
        echo "  logs             - Show recent log files"
        echo ""
        echo "Servers:"
        echo "  Port 3000 - EHG_Engineer (LEO Protocol Framework)"
        echo "  Port 8080 - EHG App (Frontend/UI)"
        echo "  Port 8000 - Agent Platform (Research Backend)"
        echo ""
        echo "Enhanced Safety Features:"
        echo "  ✓ Memory checks before startup (warns if <500MB free)"
        echo "  ✓ File watcher limit validation"
        echo "  ✓ Process tree cleanup (kills child processes)"
        echo "  ✓ WSL health monitoring during operations"
        echo "  ✓ Graceful shutdown (${SHUTDOWN_GRACE_PERIOD}s SIGTERM grace period)"
        echo "  ✓ Sequential startup (${STARTUP_DELAY}s delay between servers)"
        echo "  ✓ Restart cooldown (${RESTART_COOLDOWN}s stabilization period)"
        echo "  ✓ Operation timeout protection (${OPERATION_TIMEOUT}s max)"
        echo "  ✓ Concurrent operation lock"
        echo "  ✓ Detailed logging to $LOG_DIR"
        echo "  ✓ Emergency cleanup mode"
        echo ""
        echo "WSL2 Crash Prevention:"
        echo "  - Process tree cleanup ensures no orphaned processes"
        echo "  - WSL health checks detect filesystem issues early"
        echo "  - Longer cooldown prevents memory pressure"
        echo "  - All output logged (not hidden in /dev/null)"
        echo "  - Lock file prevents concurrent operations"
        echo ""
        echo "WSL2 Configuration:"
        echo "  If WSL crashes, increase memory in .wslconfig:"
        echo "  C:\\Users\\<YourUsername>\\.wslconfig"
        echo "  [wsl2]"
        echo "  memory=8GB"
        echo "  processors=4"
        exit 1
        ;;
esac
