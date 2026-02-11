#!/bin/bash
set -euo pipefail

# infiniteDEV Plugin Installation Script
# Installs the automatic session tracking plugin for Claude Code

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$HOME/.claude/plugins/infiniteDEV"

echo ""
echo "======================================================================"
echo "  Installing infiniteDEV Claude Code Plugin"
echo "======================================================================"
echo ""

# Create plugin directory
echo "Creating plugin directory..."
mkdir -p "$PLUGIN_DIR/hooks"

# Copy plugin files
echo "Copying plugin files..."
cp "${PROJECT_ROOT}/plugin/manifest.json" "$PLUGIN_DIR/"
cp "${PROJECT_ROOT}/plugin/hooks/hooks.json" "$PLUGIN_DIR/hooks/"
cp "${PROJECT_ROOT}/plugin/hooks/register-session.sh" "$PLUGIN_DIR/hooks/"
cp "${PROJECT_ROOT}/plugin/hooks/end-session.sh" "$PLUGIN_DIR/hooks/"
cp "${PROJECT_ROOT}/plugin/README.md" "$PLUGIN_DIR/"

# Make hooks executable
chmod +x "$PLUGIN_DIR/hooks/register-session.sh"
chmod +x "$PLUGIN_DIR/hooks/end-session.sh"

echo "✓ Plugin files installed to $PLUGIN_DIR"
echo ""

# Set daemon path in shell profile (optional)
echo "Configuring environment variables..."

SHELL_PROFILE=""
if [ -f "$HOME/.zshrc" ]; then
  SHELL_PROFILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_PROFILE="$HOME/.bashrc"
elif [ -f "$HOME/.bash_profile" ]; then
  SHELL_PROFILE="$HOME/.bash_profile"
fi

if [ -n "$SHELL_PROFILE" ]; then
  if ! grep -q "INFINITEDEV_DAEMON_PATH" "$SHELL_PROFILE" 2>/dev/null; then
    echo "" >> "$SHELL_PROFILE"
    echo "# infiniteDEV daemon path for auto-start (plugin)" >> "$SHELL_PROFILE"
    echo "export INFINITEDEV_DAEMON_PATH=\"${PROJECT_ROOT}\"" >> "$SHELL_PROFILE"
    echo "✓ Added INFINITEDEV_DAEMON_PATH to $SHELL_PROFILE"
  else
    echo "✓ INFINITEDEV_DAEMON_PATH already set in $SHELL_PROFILE"
  fi
else
  echo "⚠ Could not find shell profile. Please manually add:"
  echo "   export INFINITEDEV_DAEMON_PATH=\"${PROJECT_ROOT}\""
fi

echo ""
echo "======================================================================"
echo "  Installation Complete!"
echo "======================================================================"
echo ""
echo "IMPORTANT: Restart Claude Code for the plugin to take effect."
echo ""
echo "Once restarted, every Claude Code session will automatically:"
echo "  ✓ Register with infiniteDEV daemon"
echo "  ✓ Block if rate limit is active"
echo "  ✓ Deregister on exit"
echo ""
echo "Usage: Just run 'claude-code' normally - no wrapper needed!"
echo ""
echo "For more information, see: $PLUGIN_DIR/README.md"
echo ""
