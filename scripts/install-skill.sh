#!/usr/bin/env bash
# ==============================================================================
# Agent Plan Viewer - One-Command Skill Installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ppopli/agent-plan-viewer/main/scripts/install-skill.sh | bash
# Or locally:
#   ./scripts/install-skill.sh [--global] [--target agy|claude|cursor|all]
# ==============================================================================

set -e

TARGET="${1:-all}"
IS_GLOBAL=false

for arg in "$@"; do
  if [ "$arg" = "--global" ] || [ "$arg" = "-g" ]; then
    IS_GLOBAL=true
  fi
done

echo ""
echo "⚡ Installing Agent Plan Viewer Skill..."

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js is required (>= 18.0.0). Please install Node.js first."
  exit 1
fi

# Run the installer via npx or local cli
if [ -f "./bin/cli.js" ]; then
  if [ "$IS_GLOBAL" = true ]; then
    node ./bin/cli.js install-skill --global --target "$TARGET"
  else
    node ./bin/cli.js install-skill --target "$TARGET"
  fi
else
  if [ "$IS_GLOBAL" = true ]; then
    npx agent-plan-viewer install-skill --global --target "$TARGET"
  else
    npx agent-plan-viewer install-skill --target "$TARGET"
  fi
fi
