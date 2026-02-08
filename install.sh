#!/bin/bash

###########################################################################
# infiniteDEV Installation Script
# One-command setup for 24/7 Claude Code orchestration
###########################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFINITEDEV_DIR="$PROJECT_ROOT/.infinitedev"
LOGS_DIR="$INFINITEDEV_DIR/logs"

# Helper functions
log_info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is not installed"
    return 1
  fi
  return 0
}

###########################################################################
# Main Installation
###########################################################################

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         infiniteDEV Installation                               ║"
echo "║     24/7 Claude Code Orchestration System                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Check prerequisites
log_info "Checking prerequisites..."

missing_deps=0

if ! check_command "node"; then
  log_error "Node.js is required (https://nodejs.org/)"
  missing_deps=$((missing_deps + 1))
fi

if ! check_command "git"; then
  log_error "Git is required (https://git-scm.com/)"
  missing_deps=$((missing_deps + 1))
fi

if ! check_command "go"; then
  log_error "Go is required (https://golang.org/)"
  missing_deps=$((missing_deps + 1))
fi

if ! check_command "tmux"; then
  log_error "tmux is required (https://github.com/tmux/tmux)"
  missing_deps=$((missing_deps + 1))
fi

if [ $missing_deps -gt 0 ]; then
  log_error "Missing $missing_deps required dependencies"
  echo ""
  echo "Please install the missing tools and run this script again."
  exit 1
fi

log_success "All prerequisites met"

# Step 2: Create directories
log_info "Creating directories..."
mkdir -p "$LOGS_DIR"
mkdir -p "$PROJECT_ROOT/src/daemon"
mkdir -p "$PROJECT_ROOT/src/health"
mkdir -p "$PROJECT_ROOT/src/cli"
mkdir -p "$PROJECT_ROOT/src/personas/templates"
mkdir -p "$PROJECT_ROOT/scripts"
mkdir -p "$PROJECT_ROOT/docs"
log_success "Directories created"

# Step 3: Install Claude Code CLI if missing
if ! command -v claude-code &> /dev/null; then
  log_info "Installing Claude Code CLI..."
  npm install -g @anthropic-ai/claude-code || {
    log_error "Failed to install Claude Code CLI"
    log_info "You can install it manually: npm install -g @anthropic-ai/claude-code"
  }
else
  log_success "Claude Code CLI already installed"
fi

# Step 4: Install Beads
log_info "Installing Beads..."
if npm install -g @beads/bd 2>/dev/null; then
  log_success "Beads installed"
else
  log_warn "npm installation failed, trying go install..."
  go install github.com/steveyegge/beads/cmd/bd@latest && log_success "Beads installed" || {
    log_error "Failed to install Beads"
    exit 1
  }
fi

# Step 5: Install Gastown
log_info "Installing Gastown..."
go install github.com/steveyegge/gastown/cmd/gt@latest && log_success "Gastown installed" || {
  log_error "Failed to install Gastown"
  exit 1
}

# Step 6: Install project dependencies
log_info "Installing infiniteDEV dependencies..."
cd "$PROJECT_ROOT"
npm install || {
  log_error "Failed to install npm dependencies"
  exit 1
}
log_success "Dependencies installed"

# Step 7: Install PM2
log_info "Installing PM2 globally..."
npm install -g pm2 || {
  log_error "Failed to install PM2"
  exit 1
}
log_success "PM2 installed"

# Step 8: Initialize Beads
log_info "Initializing Beads..."
cd "$PROJECT_ROOT"
if bash "$PROJECT_ROOT/scripts/setup-beads.sh"; then
  log_success "Beads initialized"
else
  log_warn "Beads setup encountered issues, continuing..."
fi

# Step 9: Initialize Gastown
log_info "Initializing Gastown..."
if bash "$PROJECT_ROOT/scripts/setup-gastown.sh"; then
  log_success "Gastown initialized"
else
  log_warn "Gastown setup encountered issues, continuing..."
fi

# Step 10: Create default personas
log_info "Creating default agent personas..."
if bash "$PROJECT_ROOT/scripts/create-personas.sh"; then
  log_success "Agent personas configured"
else
  log_warn "Persona setup encountered issues, continuing..."
fi

# Step 11: Create default config if it doesn't exist
if [ ! -f "$INFINITEDEV_DIR/config.json" ]; then
  log_info "Creating default configuration..."
  cat > "$INFINITEDEV_DIR/config.json" << 'EOF'
{
  "version": "1.0.0",
  "tier": "pro-20",
  "limits": {
    "window": 18000000,
    "prompts": 45,
    "weeklyHours": 60
  },
  "personas": {
    "architect": { "enabled": true, "instances": 1 },
    "builder": { "enabled": true, "instances": 2 },
    "tester": { "enabled": true, "instances": 1 },
    "reviewer": { "enabled": true, "instances": 1 },
    "lead-dev": { "enabled": true, "instances": 1 }
  },
  "mayor": {
    "pollInterval": 30,
    "maxConcurrentTasks": 5
  },
  "daemon": {
    "checkInterval": 5,
    "preemptivePause": true,
    "preemptiveThreshold": 0.9
  }
}
EOF
  log_success "Default configuration created"
else
  log_success "Configuration already exists"
fi

# Step 12: Start PM2 ecosystem
log_info "Starting infiniteDEV services..."
cd "$PROJECT_ROOT"
pm2 start ecosystem.config.js || {
  log_error "Failed to start PM2 services"
  exit 1
}
log_success "Services started"

# Step 13: Save PM2 config and setup auto-restart
log_info "Configuring auto-startup..."
pm2 save || log_warn "Could not save PM2 config"
pm2 startup || log_warn "Could not setup PM2 auto-startup"

# Step 14: Create CLI symlink
log_info "Setting up CLI command..."
npm link || log_warn "Could not create CLI symlink"
chmod +x "$PROJECT_ROOT/src/cli/index.js"
log_success "CLI command configured"

# Step 15: Summary
echo ""
echo -e "${GREEN}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         ✓ infiniteDEV installed successfully!                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo ""
echo "Quick start:"
echo -e "  ${BLUE}idev status${NC}              # Check system status"
echo -e "  ${BLUE}idev task create 'Task'${NC}  # Create a task"
echo -e "  ${BLUE}idev logs${NC}                # View logs"
echo -e "  ${BLUE}idev --help${NC}              # See all commands"
echo ""
echo "Services running:"
pm2 status
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Verify all services are running (should see 3 processes above)"
echo "2. Run: idev status"
echo "3. Create your first task: idev task create \"Build something awesome\""
echo ""
echo "For more information, see:"
echo "  - README.md"
echo "  - docs/getting-started.md"
echo "  - docs/architecture.md"
echo ""
