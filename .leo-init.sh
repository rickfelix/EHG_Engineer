#!/bin/bash
# LEO Protocol Shell Initialization
# Add this to your .bashrc or .zshrc:
# source /path/to/EHG_Engineer/.leo-init.sh

# Function to auto-initialize LEO when entering the project directory
leo_auto_init() {
    # Check if we're in an EHG_Engineer project
    if [ -f "package.json" ] && grep -q "ehg-engineer" package.json 2>/dev/null; then
        # Check if we haven't already initialized in this shell session
        if [ "$LEO_INITIALIZED" != "$(pwd)" ]; then
            export LEO_INITIALIZED="$(pwd)"
            
            # Run auto-init silently
            if [ -f "scripts/leo-auto-init.js" ]; then
                node scripts/leo-auto-init.js --quick --silent 2>/dev/null
                
                # Check if it succeeded by looking for CLAUDE.md
                if [ -f "CLAUDE.md" ]; then
                    # Get the version from CLAUDE.md
                    LEO_VERSION=$(grep "CURRENT LEO PROTOCOL VERSION" CLAUDE.md | grep -oE "v[0-9]+\.[0-9]+\.[0-9]+[_a-z]*" | head -1)
                    
                    if [ -n "$LEO_VERSION" ]; then
                        echo "🟢 LEO Protocol $LEO_VERSION ready"
                    fi
                fi
            fi
        fi
    fi
}

# Hook into cd command (bash)
if [ -n "$BASH_VERSION" ]; then
    # Save original cd function
    if ! type __original_cd >/dev/null 2>&1; then
        alias __original_cd='builtin cd'
    fi
    
    # Override cd
    cd() {
        __original_cd "$@"
        leo_auto_init
    }
fi

# Hook into cd command (zsh)
if [ -n "$ZSH_VERSION" ]; then
    # Use chpwd hook in zsh
    chpwd() {
        leo_auto_init
    }
fi

# Aliases for quick access
alias leo='npm run leo'
alias leo-status='npm run leo-status'
alias leo-sync='npm run leo:sync'
alias leo-auto='npm run leo:auto'

# Run initialization if we're already in the project directory
leo_auto_init

# Export function for manual use
export -f leo_auto_init 2>/dev/null || true