#!/bin/bash

###########################################################################
# Create Default Agent Personas
###########################################################################

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Creating default agent personas..."

cd "$PROJECT_ROOT"

# Create the 5 default personas as crew members
# Each persona is a persistent Claude Code agent with a specialized role

# 1. Architect - System design and task decomposition
echo "Registering Architect agent..."
gt crew add architect \
  --persona "architect" \
  --model "claude-opus-4-5" \
  --description "System Architect - Analyzes requirements and designs systems" \
  || echo "Architect may already be registered"

# 2. Builder (Instance 1) - Implementation
echo "Registering Builder-1 agent..."
gt crew add builder-1 \
  --persona "builder" \
  --model "claude-opus-4-5" \
  --description "Builder 1 - Implements features and fixes bugs" \
  || echo "Builder-1 may already be registered"

# 3. Builder (Instance 2) - Implementation (parallel)
echo "Registering Builder-2 agent..."
gt crew add builder-2 \
  --persona "builder" \
  --model "claude-opus-4-5" \
  --description "Builder 2 - Implements features and fixes bugs" \
  || echo "Builder-2 may already be registered"

# 4. Tester - Quality assurance and testing
echo "Registering Tester agent..."
gt crew add tester \
  --persona "tester" \
  --model "claude-opus-4-5" \
  --description "Tester - Writes tests and validates quality" \
  || echo "Tester may already be registered"

# 5. Reviewer - Code review and quality gate
echo "Registering Reviewer agent..."
gt crew add reviewer \
  --persona "reviewer" \
  --model "claude-opus-4-5" \
  --description "Reviewer - Reviews code and ensures quality" \
  || echo "Reviewer may already be registered"

# 6. LeadDev - Coordination and monitoring
echo "Registering LeadDev agent..."
gt crew add lead-dev \
  --persona "lead-dev" \
  --model "claude-opus-4-5" \
  --description "Lead Developer - Coordinates work and manages team" \
  || echo "LeadDev may already be registered"

echo ""
echo "Agent personas configured!"
echo ""
echo "Registered agents:"
gt crew list || echo "Could not list agents"
