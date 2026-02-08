#!/bin/bash

###########################################################################
# Setup Beads Task Tracker
###########################################################################

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Setting up Beads..."

cd "$PROJECT_ROOT"

# Initialize Beads if not already initialized
if [ ! -f ".beads/issues.jsonl" ]; then
  echo "Initializing Beads repository..."
  bd init || {
    echo "Error: Failed to initialize Beads"
    exit 1
  }
else
  echo "Beads already initialized"
fi

# Set up hooks for Claude Code integration
echo "Configuring Beads hooks..."
bd setup claude || echo "Beads hooks may already be configured"

echo "Beads setup complete!"
