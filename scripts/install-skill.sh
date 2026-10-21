#!/usr/bin/env bash
# ==============================================================================
# Agent Plan Viewer - One-Command CLI & Skill Installer / Updater
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/ppopli/agent-plan-viewer/main/scripts/install-skill.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ppopli/agent-plan-viewer/main/scripts/install-skill.sh | bash -s -- --global
# Or locally:
#   ./scripts/install-skill.sh [--global] [--target agy|claude|cursor|all] [--dry-run]
# ==============================================================================

set -e

TARGET="all"
IS_GLOBAL=false
IS_DRY_RUN=false
NO_RULES=false

while [ $# -gt 0 ]; do
  case "$1" in
    --global|-g)
      IS_GLOBAL=true
      shift
      ;;
    --target|-t)
      TARGET="${2:-all}"
      shift 2
      ;;
    --dry-run)
      IS_DRY_RUN=true
      shift
      ;;
    --no-rules)
      NO_RULES=true
      shift
      ;;
    all|agy|claude|cursor)
      TARGET="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

echo ""
echo "⚡ Agent Plan Viewer System & Skill Installer"

# 1. Check Node.js & npm
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js is required (>= 18.0.0). Please install Node.js first."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ Error: npm is required. Please install npm first."
  exit 1
fi

# 2. Install or update the global `agent-plan-viewer` CLI on the system
if command -v agent-plan-viewer >/dev/null 2>&1; then
  CURRENT_VER="$(agent-plan-viewer --version 2>/dev/null || echo 'unknown')"
  if [ "$IS_DRY_RUN" = true ]; then
    echo "  ↻ [dry-run] agent-plan-viewer (v${CURRENT_VER}) is installed. Would update to latest."
  else
    echo "  ↻ agent-plan-viewer (v${CURRENT_VER}) is already installed. Updating to latest..."
    if [ -f "./package.json" ] && [ -f "./bin/cli.js" ]; then
      npm run build >/dev/null 2>&1 || true
      npm install -g . || npm install -g agent-plan-viewer@latest || npm install -g github:ppopli/agent-plan-viewer
    else
      npm install -g agent-plan-viewer@latest || npm install -g github:ppopli/agent-plan-viewer
    fi
    NEW_VER="$(agent-plan-viewer --version 2>/dev/null || echo 'latest')"
    echo "  ✓ Updated system CLI: agent-plan-viewer (v${CURRENT_VER} -> v${NEW_VER})"
  fi
else
  if [ "$IS_DRY_RUN" = true ]; then
    echo "  + [dry-run] agent-plan-viewer is not installed. Would install globally via npm."
  else
    echo "  + agent-plan-viewer is not installed on this system. Installing globally..."
    if [ -f "./package.json" ] && [ -f "./bin/cli.js" ]; then
      npm run build >/dev/null 2>&1 || true
      npm install -g . || npm install -g agent-plan-viewer@latest || npm install -g github:ppopli/agent-plan-viewer
    else
      npm install -g agent-plan-viewer@latest || npm install -g github:ppopli/agent-plan-viewer
    fi
    NEW_VER="$(agent-plan-viewer --version 2>/dev/null || echo 'latest')"
    echo "  ✓ Installed system CLI: agent-plan-viewer (v${NEW_VER})"
  fi
fi

# 3. Build CLI args for installing/updating skill files & rules
CLI_ARGS=(install-skill --skip-cli --target "$TARGET")
if [ "$IS_GLOBAL" = true ]; then
  CLI_ARGS+=(--global)
fi
if [ "$IS_DRY_RUN" = true ]; then
  CLI_ARGS+=(--dry-run)
fi
if [ "$NO_RULES" = true ]; then
  CLI_ARGS+=(--no-rules)
fi

# 4. Run skill & rule installer/updater
if [ -f "./bin/cli.js" ]; then
  node ./bin/cli.js "${CLI_ARGS[@]}"
elif command -v agent-plan-viewer >/dev/null 2>&1; then
  agent-plan-viewer "${CLI_ARGS[@]}"
else
  npx --yes agent-plan-viewer@latest "${CLI_ARGS[@]}"
fi

