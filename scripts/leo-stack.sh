#!/bin/bash
# LEO Stack Management Script - Cross-Platform Version
# Manages the LEO Stack servers:
#   - EHG_Engineer (port 3000): LEO Protocol Framework & Backend API
#   - EHG App (port 8080): Unified Frontend (User + Admin with /admin routes)
#
# NOTE: On Windows, use the PowerShell version (leo-stack.ps1) instead.
# The cross-platform runner (node scripts/cross-platform-run.js leo-stack)
# automatically selects the appropriate script for your platform.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Timing settings
STARTUP_DELAY=3
RESTART_COOLDOWN=5
SHUTDOWN_GRACE_PERIOD=5

# Fast mode settings
FAST_MODE=false
FAST_STARTUP_DELAY=1
FAST_RESTART_COOLDOWN=2

# Directories (relative paths for portability)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINEER_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$(dirname "$ENGINEER_DIR")/ehg"

# PID file locations
PID_DIR="$ENGINEER_DIR/.pids"
mkdir -p "$PID_DIR"
ENGINEER_PID="$PID_DIR/engineer.pid"
APP_PID="$PID_DIR/app.pid"

# Log directory
LOG_DIR="$ENGINEER_DIR/.logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/leo-stack-$(date +%Y%m%d-%H%M%S).log"

# Function to log messages
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "$message"
    echo "[$timestamp] [$level] $message" | sed 's/\x1b\[[0-9;]*m//g' >> "$LOG_FILE"
}

# Function to check if a port is in use
port_in_use() {
    if command -v lsof &> /dev/null; then
        lsof -i :$1 -P -n > /dev/null 2>&1
    elif command -v ss &> /dev/null; then
        ss -tuln | grep -q ":$1 "
    elif command -v netstat &> /dev/null; then
        netstat -tuln | grep -q ":$1 "
    else
        return 1
    fi
}

# Function to clean a port
clean_port() {
    local port=$1
    local name=$2

    if port_in_use $port; then
        log "INFO" "${YELLOW}[CLEAN] Cleaning up processes on port $port ($name)...${NC}"

        if command -v lsof &> /dev/null; then
            local pids=$(lsof -ti:$port 2>/dev/null)
            if [ -n "$pids" ]; then
                for pid in $pids; do
                    log "INFO" "${YELLOW}   - Stopping PID $pid${NC}"
                    kill -TERM $pid 2>/dev/null || true
                done
                sleep 2

                # Force kill if still running
                pids=$(lsof -ti:$port 2>/dev/null)
                for pid in $pids; do
                    kill -9 $pid 2>/dev/null || true
                done
            fi
        fi

        if port_in_use $port; then
            log "ERROR" "${RED}   [WARN] Port $port still in use after cleanup${NC}"
            return 1
        fi

        log "INFO" "${GREEN}   [OK] Port $port is now free${NC}"
    fi
    return 0
}

# Function to start EHG_Engineer server (port 3000)
start_engineer() {
    log "INFO" "${BLUE}[TOOL] Starting EHG_Engineer server (port 3000)...${NC}"

    if port_in_use 3000; then
        log "WARN" "${YELLOW}[WARN] Port 3000 already in use - cleaning up...${NC}"
        clean_port 3000 "EHG_Engineer" || return 1
    fi

    cd "$ENGINEER_DIR"
    local server_log="$LOG_DIR/engineer-$(date +%Y%m%d-%H%M%S).log"
    PORT=3000 node server.js >> "$server_log" 2>&1 &
    local pid=$!
    echo $pid > "$ENGINEER_PID"

    sleep 2
    if ps -p $pid > /dev/null 2>&1; then
        log "INFO" "${GREEN}[OK] EHG_Engineer server started (PID: $pid)${NC}"
        log "INFO" "   * http://localhost:3000"
        log "INFO" "   * Log: $server_log"
        return 0
    else
        log "ERROR" "${RED}[ERROR] EHG_Engineer failed to start! Check log: $server_log${NC}"
        return 1
    fi
}

# Function to start EHG App frontend (port 8080)
start_app() {
    log "INFO" "${BLUE}[UI] Starting EHG App frontend (port 8080)...${NC}"

    if port_in_use 8080; then
        log "WARN" "${YELLOW}[WARN] Port 8080 already in use - cleaning up...${NC}"
        clean_port 8080 "EHG App" || return 1
    fi

    cd "$APP_DIR"
    local app_log="$LOG_DIR/app-$(date +%Y%m%d-%H%M%S).log"
    PORT=8080 npm run dev -- --host 0.0.0.0 >> "$app_log" 2>&1 &
    local pid=$!
    echo $pid > "$APP_PID"

    sleep 3
    if ps -p $pid > /dev/null 2>&1; then
        log "INFO" "${GREEN}[OK] EHG App frontend started (PID: $pid)${NC}"
        log "INFO" "   * http://localhost:8080"
        log "INFO" "   * Log: $app_log"
        return 0
    else
        log "ERROR" "${RED}[ERROR] EHG App failed to start! Check log: $app_log${NC}"
        return 1
    fi
}

# Function to stop a server by PID file
stop_server() {
    local pid_file=$1
    local name=$2

    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            log "INFO" "${YELLOW}Stopping $name (PID: $pid)...${NC}"
            kill -TERM $pid 2>/dev/null || true

            local waited=0
            while ps -p $pid > /dev/null 2>&1 && [ $waited -lt $SHUTDOWN_GRACE_PERIOD ]; do
                sleep 1
                waited=$((waited + 1))
            done

            if ps -p $pid > /dev/null 2>&1; then
                log "WARN" "${YELLOW}[WARN] $name still running, force killing...${NC}"
                kill -9 $pid 2>/dev/null || true
            fi

            log "INFO" "${GREEN}[OK] Stopped $name${NC}"
        else
            log "WARN" "${YELLOW}[WARN] $name not running (stale PID file)${NC}"
        fi
        rm "$pid_file"
    else
        log "WARN" "${YELLOW}[WARN] $name PID file not found${NC}"
    fi
}

# Function to stop all servers
stop_all() {
    log "INFO" "${RED}[STOP] Stopping all servers...${NC}"
    echo "=================================="

    stop_server "$APP_PID" "EHG App"
    sleep 1
    stop_server "$ENGINEER_PID" "EHG_Engineer"

    echo "=================================="

    # Clean any remaining processes on ports
    for port in 3000 8080; do
        if port_in_use $port; then
            log "WARN" "${YELLOW}[WARN] Port $port still in use, cleaning up...${NC}"
            clean_port $port "Port $port"
        fi
    done

    log "INFO" "${GREEN}[OK] All servers stopped${NC}"
}

# Function to show server status
status() {
    log "INFO" "${BLUE}[STATUS] Server Status:${NC}"
    echo "=================================="

    check_status() {
        local pid_file=$1
        local port=$2
        local name=$3

        if [ -f "$pid_file" ]; then
            local pid=$(cat "$pid_file")
            if ps -p $pid > /dev/null 2>&1; then
                log "INFO" "${GREEN}[OK] $name: Running (PID: $pid, Port: $port)${NC}"
                return
            fi
        fi

        if port_in_use $port; then
            log "INFO" "${YELLOW}[WARN] $name: Running (no PID file, Port: $port)${NC}"
        else
            log "INFO" "${RED}[--] $name: Not running${NC}"
        fi
    }

    check_status "$ENGINEER_PID" 3000 "EHG_Engineer (3000)"
    check_status "$APP_PID" 8080 "EHG App (8080)"
    echo "=================================="

    # Show memory if available
    if command -v free &> /dev/null; then
        local free_mem=$(free -m | awk '/^Mem:/{print $7}')
        log "INFO" "${GREEN}[MEM] Available Memory: ${free_mem}MB${NC}"
    fi
}

# Function to start all servers
start_all() {
    local mode_text=""
    if [ "$FAST_MODE" = true ]; then
        mode_text="(FAST MODE)"
    fi
    log "INFO" "${BLUE}[START] Starting LEO Stack $mode_text...${NC}"
    echo "=================================="

    # Clean up any existing processes
    log "INFO" "${BLUE}Cleaning ports...${NC}"
    clean_port 3000 "EHG_Engineer"
    clean_port 8080 "EHG App"

    echo "=================================="
    log "INFO" "${BLUE}Starting servers (${STARTUP_DELAY}s delay between each)...${NC}"
    echo "=================================="

    start_engineer || { log "ERROR" "${RED}Failed to start EHG_Engineer${NC}"; return 1; }
    log "INFO" "${YELLOW}Waiting ${STARTUP_DELAY}s...${NC}"
    sleep $STARTUP_DELAY

    start_app || { log "ERROR" "${RED}Failed to start EHG App${NC}"; return 1; }

    echo "=================================="
    log "INFO" "${GREEN}[DONE] LEO Stack startup complete!${NC}"
    log "INFO" "${MAGENTA}[LOG] Log file: $LOG_FILE${NC}"
    echo ""
    sleep 2
    status
}

# Function to restart all servers
restart_all() {
    local mode_text=""
    if [ "$FAST_MODE" = true ]; then
        mode_text="(FAST MODE)"
    fi
    log "INFO" "${BLUE}[RESTART] Restarting LEO Stack $mode_text...${NC}"
    echo "=================================="

    stop_all

    log "INFO" "${YELLOW}[WAIT] COOLDOWN: Waiting ${RESTART_COOLDOWN}s...${NC}"
    sleep $RESTART_COOLDOWN

    # Verify ports are free
    local ports_clear=true
    for port in 3000 8080; do
        if port_in_use $port; then
            log "ERROR" "${RED}[WARN] Port $port still in use!${NC}"
            ports_clear=false
        fi
    done

    if [ "$ports_clear" = false ]; then
        log "ERROR" "${RED}[WARN] Not all ports cleared. Run 'clean' command first.${NC}"
        return 1
    fi

    log "INFO" "${GREEN}[OK] All ports clear, starting servers...${NC}"
    echo "=================================="

    start_all
}

# Parse flags
parse_flags() {
    for arg in "$@"; do
        case "$arg" in
            --fast|-f|-Fast)
                FAST_MODE=true
                STARTUP_DELAY=$FAST_STARTUP_DELAY
                RESTART_COOLDOWN=$FAST_RESTART_COOLDOWN
                log "INFO" "${MAGENTA}[FAST] Fast mode enabled: delays reduced${NC}"
                ;;
        esac
    done
}

# Parse flags from all arguments
parse_flags "$@"

# Main command handler
case "${1:-}" in
    start)
        start_all
        ;;
    stop)
        stop_all
        ;;
    restart)
        restart_all
        ;;
    status)
        status
        ;;
    clean)
        log "INFO" "${BLUE}[CLEAN] Cleaning all ports...${NC}"
        clean_port 3000 "EHG_Engineer"
        clean_port 8080 "EHG App"
        ;;
    start-engineer)
        start_engineer
        ;;
    start-app)
        start_app
        ;;
    *)
        echo "LEO Stack Management Script - Cross-Platform Version"
        echo "====================================================="
        echo ""
        echo "Usage: $0 {start|stop|restart|status|clean} [--fast]"
        echo ""
        echo "Primary Commands:"
        echo "  start            - Start all LEO Stack servers"
        echo "  stop             - Stop all servers gracefully"
        echo "  restart          - Restart all servers"
        echo "  status           - Show server status"
        echo "  clean            - Clean up processes on all ports"
        echo ""
        echo "Fast Mode (--fast or -f):"
        echo "  start --fast     - Quick startup with reduced delays"
        echo "  restart --fast   - Quick restart with shorter cooldown"
        echo ""
        echo "Advanced Commands:"
        echo "  start-engineer   - Start only EHG_Engineer (3000)"
        echo "  start-app        - Start only EHG App (8080)"
        echo ""
        echo "Servers:"
        echo "  Port 3000 - EHG_Engineer (LEO Protocol Framework, Backend API)"
        echo "  Port 8080 - EHG App (Frontend UI with Vite)"
        echo ""
        echo "NOTE: On Windows, use 'node scripts/cross-platform-run.js leo-stack'"
        echo "      which automatically uses the PowerShell version (leo-stack.ps1)"
        exit 1
        ;;
esac
