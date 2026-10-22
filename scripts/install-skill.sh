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

# 2. Install or update the `agent-plan-viewer` CLI (globally with sudo fallback if --global, else locally)
install_global_cli() {
  if [ -f "./package.json" ] && [ -f "./bin/cli.js" ]; then
    npm run build >/dev/null 2>&1 || true
    if npm install -g .; then
      return 0
    fi
  fi
  if npm install -g agent-plan-viewer@latest || npm install -g github:ppopli/agent-plan-viewer; then
    return 0
  fi
  echo "  🔐 Global npm directory requires administrator privileges. Prompting for sudo password..."
  if [ -r /dev/tty ]; then
    sudo npm install -g agent-plan-viewer@latest </dev/tty || sudo npm install -g github:ppopli/agent-plan-viewer </dev/tty
  else
    sudo npm install -g agent-plan-viewer@latest || sudo npm install -g github:ppopli/agent-plan-viewer
  fi
}

install_local_cli() {
  npm install --no-save agent-plan-viewer@latest || npm install --no-save github:ppopli/agent-plan-viewer
}

if [ "$IS_GLOBAL" = true ]; then
  if command -v agent-plan-viewer >/dev/null 2>&1; then
    CURRENT_VER="$(agent-plan-viewer --version 2>/dev/null || echo 'unknown')"
    if [ "$IS_DRY_RUN" = true ]; then
      echo "  ↻ [dry-run] agent-plan-viewer (v${CURRENT_VER}) is installed globally. Would update to latest."
    else
      echo "  ↻ agent-plan-viewer (v${CURRENT_VER}) is already installed globally. Updating to latest..."
      install_global_cli
      NEW_VER="$(agent-plan-viewer --version 2>/dev/null || echo 'latest')"
      echo "  ✓ Updated system CLI: agent-plan-viewer (v${CURRENT_VER} -> v${NEW_VER})"
    fi
  else
    if [ "$IS_DRY_RUN" = true ]; then
      echo "  + [dry-run] agent-plan-viewer is not installed globally. Would install globally via npm (with sudo if required)."
    else
      echo "  + agent-plan-viewer is not installed on this system. Installing globally..."
      install_global_cli
      NEW_VER="$(agent-plan-viewer --version 2>/dev/null || echo 'latest')"
      echo "  ✓ Installed system CLI: agent-plan-viewer (v${NEW_VER})"
    fi
  fi
else
  if [ -f "./node_modules/.bin/agent-plan-viewer" ]; then
    CURRENT_VER="$(./node_modules/.bin/agent-plan-viewer --version 2>/dev/null || echo 'unknown')"
    if [ "$IS_DRY_RUN" = true ]; then
      echo "  ↻ [dry-run] Local ./node_modules/.bin/agent-plan-viewer (v${CURRENT_VER}) exists. Would update locally."
    else
      echo "  ↻ Local ./node_modules/.bin/agent-plan-viewer (v${CURRENT_VER}) is installed. Updating locally..."
      install_local_cli
      NEW_VER="$(./node_modules/.bin/agent-plan-viewer --version 2>/dev/null || echo 'latest')"
      echo "  ✓ Updated local CLI: ./node_modules/.bin/agent-plan-viewer (v${CURRENT_VER} -> v${NEW_VER})"
    fi
  else
    if [ "$IS_DRY_RUN" = true ]; then
      echo "  + [dry-run] Local CLI not installed. Would install locally into ./node_modules/.bin/agent-plan-viewer (no sudo)."
    else
      echo "  + Installing agent-plan-viewer locally into ./node_modules/.bin/agent-plan-viewer (no sudo required)..."
      install_local_cli
      NEW_VER="$(./node_modules/.bin/agent-plan-viewer --version 2>/dev/null || echo 'latest')"
      echo "  ✓ Installed local CLI: ./node_modules/.bin/agent-plan-viewer (v${NEW_VER})"
    fi
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
elif [ -f "./node_modules/.bin/agent-plan-viewer" ]; then
  ./node_modules/.bin/agent-plan-viewer "${CLI_ARGS[@]}"
elif command -v agent-plan-viewer >/dev/null 2>&1; then
  agent-plan-viewer "${CLI_ARGS[@]}"
else
  npx --yes agent-plan-viewer@latest "${CLI_ARGS[@]}"
fi

