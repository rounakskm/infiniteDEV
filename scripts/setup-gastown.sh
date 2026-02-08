#!/bin/bash

###########################################################################
# Setup Gastown Multi-Agent Orchestration
###########################################################################

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GASTOWN_DIR="$PROJECT_ROOT/.gastown"

echo "Setting up Gastown..."

cd "$PROJECT_ROOT"

# Create Gastown directory if it doesn't exist
mkdir -p "$GASTOWN_DIR"

# Initialize Gastown in project directory if not already initialized
if [ ! -f "$GASTOWN_DIR/config.json" ]; then
  echo "Initializing Gastown rig..."
  gt init --path "$GASTOWN_DIR" || {
    echo "Error: Failed to initialize Gastown"
    exit 1
  }
else
  echo "Gastown already initialized"
fi

# Configure Claude Code as the agent runtime
echo "Configuring Claude Code as agent runtime..."
gt config agent set claude-code "claude-code" \
  --args "--mode interactive" \
  --env "CLAUDE_LOG_LEVEL=info" || echo "Agent configuration may already be set"

# Set default agent
gt config default-agent claude-code || echo "Default agent may already be set"

echo "Gastown setup complete!"
echo "Note: Agent (Polecat/Crew) configuration will be completed in create-personas.sh"
