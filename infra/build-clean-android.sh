#!/usr/bin/env bash
# Use this script to create a "clean" build of the Android app for release.
# This just helps ensure that no dev config ends up in a production release build.
#
# Behavior:
# - By default the script will clone the repo into ./tmp/deck-verified-site (shallow) if missing.
# - If the target exists and is a git repo, it will fetch, checkout and reset the 'master' branch,
#   and run `git clean -fdx` (unless --skip-clean is provided).
# - If --skip-clean is provided, git fetch/checkout/reset/clean steps are skipped (the directory is used as-is).
# - After preparing the tree, the script creates a minimal `.env` inside the target containing only the
#   variables named in the `ENV_VARS` array (default: ANDROID_STUDIO_BIN) copied from the root .env file,
#   and always sets `NODE_ENV=production`.
# - The script then runs `npm ci --cache $PROJECT_ROOT/.cache/.npm --prefer-offline` and `npm run build:android`.
#
# Usage:
#   infra/build-clean-android.sh [--repo-url URL] [--skip-clean]
#
# Environment:
#   REPO_URL  - override repository URL (default: https://github.com/DeckSettings/deck-verified-site.git)
#   You can edit the `ENV_VARS` array below to add more variables to copy from the root .env.
#
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
PROJECT_ROOT=$(realpath "$SCRIPT_DIR/..")
TMP_DIR="$PROJECT_ROOT/tmp"
TARGET_DIR="$TMP_DIR/deck-verified-site"
CACHE_DIR="$PROJECT_ROOT/.cache/.npm"
MASTER_BRANCH="master"

REPO_URL="${REPO_URL:-https://github.com/DeckSettings/deck-verified-site.git}"
SKIP_CLEAN=false

# Array of environment variable names to copy from the root .env into the target's .env.
# Edit this array to add more variables. Values are copied verbatim (preserving quoting if present).
ENV_VARS=("ANDROID_STUDIO_BIN")

# Simple CLI parsing
while [ "$#" -gt 0 ] && [[ "${1:-}" == --* ]]; do
    case "$1" in
    --repo-url)
        shift
        REPO_URL="${1:-}"
        ;;
    --skip-clean)
        SKIP_CLEAN=true
        ;;
    --help | -h)
        echo "Usage: $0 [--repo-url URL] [--skip-clean]"
        echo
        echo "If --skip-clean is provided and the target repo exists, the script will skip git fetch/checkout/reset/clean"
        echo "and only run 'npm ci' and 'npm run build:android'."
        exit 0
        ;;
    *)
        echo "Unknown option: $1" >&2
        exit 2
        ;;
    esac
    shift || true
done

echo "Project root: $PROJECT_ROOT"
echo "Temporary dir: $TMP_DIR"
echo "Target dir: $TARGET_DIR"
echo "Repository: $REPO_URL"
echo "Branch to update/checkout: $MASTER_BRANCH"
echo "NPM cache dir: $CACHE_DIR"
echo "Skip cleaning: $SKIP_CLEAN"

mkdir -p "$TMP_DIR"
mkdir -p "$CACHE_DIR"

if [ "$SKIP_CLEAN" = "true" ]; then
    echo "SKIP_CLEAN is set. Skipping git fetch/checkout/reset/clean steps."

    if [ -d "$TARGET_DIR" ]; then
        echo "Using existing directory: $TARGET_DIR"
        cd "$TARGET_DIR"
    else
        echo "Target directory does not exist; performing a shallow clone ..."
        git clone --depth 1 --branch "$MASTER_BRANCH" "$REPO_URL" "$TARGET_DIR"
        cd "$TARGET_DIR"
    fi

else
    if [ -d "$TARGET_DIR" ]; then
        echo "Found existing directory: $TARGET_DIR"

        if [ -d "$TARGET_DIR/.git" ]; then
            echo "Existing git repository detected. Reusing and updating it."
            cd "$TARGET_DIR"

            echo "Fetching from remotes..."
            git fetch --all --prune

            echo "Checking out branch '$MASTER_BRANCH'..."
            if git show-ref --verify --quiet "refs/heads/$MASTER_BRANCH"; then
                git checkout "$MASTER_BRANCH"
            else
                if git show-ref --verify --quiet "refs/remotes/origin/$MASTER_BRANCH"; then
                    git checkout -B "$MASTER_BRANCH" "origin/$MASTER_BRANCH"
                else
                    # Create a local branch named master (or whatever MASTER_BRANCH is)
                    git checkout -B "$MASTER_BRANCH"
                fi
            fi

            # Reset to origin/master if available
            if git show-ref --verify --quiet "refs/remotes/origin/$MASTER_BRANCH"; then
                echo "Resetting local branch to origin/$MASTER_BRANCH"
                git reset --hard "origin/$MASTER_BRANCH"
            else
                echo "origin/$MASTER_BRANCH not found; skipping hard reset"
            fi

            echo "Cleaning untracked files and directories (including ignored files)..."
            git clean -fdx

        else
            echo "Target directory exists but is not a git repository: $TARGET_DIR"
            echo "Removing and performing a fresh clone."
            rm -rf "$TARGET_DIR"
            echo "Cloning repository (shallow) ..."
            git clone --depth 1 --branch "$MASTER_BRANCH" "$REPO_URL" "$TARGET_DIR"
            cd "$TARGET_DIR"
        fi
    else
        echo "Target directory does not exist. Cloning repository ..."
        git clone --depth 1 --branch "$MASTER_BRANCH" "$REPO_URL" "$TARGET_DIR"
        cd "$TARGET_DIR"
    fi
fi

# Ensure we're in the target directory
cd "$TARGET_DIR"

# --- Extraction: copy only specified env vars from root .env into a clean target .env ---
ROOT_ENV_FILE="$PROJECT_ROOT/.env"
TARGET_ENV_FILE="$TARGET_DIR/.env"

# Ensure the target .env is fresh (remove existing)
if [ -f "$TARGET_ENV_FILE" ]; then
    rm -f "$TARGET_ENV_FILE"
fi

# Create (empty) target .env to start
: >"$TARGET_ENV_FILE"

if [ -f "$ROOT_ENV_FILE" ]; then
    echo "Reading env variables from $ROOT_ENV_FILE"

    for key in "${ENV_VARS[@]}"; do
        # Find lines that set this key, allow optional leading whitespace and optional 'export ' prefix.
        # Use last match in case of multiple definitions.
        found_line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$ROOT_ENV_FILE" | tail -n 1 || true)

        if [ -n "$found_line" ]; then
            # Strip leading whitespace and optional 'export ' prefix, preserve the remainder (including any quotes).
            clean_line=$(printf "%s" "$found_line" | sed -E 's/^[[:space:]]*//' | sed -E 's/^export[[:space:]]+//')
            printf "%s\n" "$clean_line" >>"$TARGET_ENV_FILE"
            echo "Added $key to target .env"
        else
            echo "WARN: $key not found in $ROOT_ENV_FILE" >&2
        fi
    done
else
    echo "WARN: Root .env not found at $ROOT_ENV_FILE; no variables copied." >&2
fi

# Always ensure NODE_ENV=production is present and last
# Remove any existing NODE_ENV lines we might have added (defensive), then append the production line.
if grep -E -q '^[[:space:]]*(export[[:space:]]+)?NODE_ENV[[:space:]]*=' "$TARGET_ENV_FILE" 2>/dev/null; then
    # Remove existing NODE_ENV lines
    sed -i.bak -E '/^[[:space:]]*(export[[:space:]]+)?NODE_ENV[[:space:]]*=/d' "$TARGET_ENV_FILE" || true
    rm -f "$TARGET_ENV_FILE.bak" || true
fi
printf "NODE_ENV=production\n" >>"$TARGET_ENV_FILE"

# Restrict permissions on the generated .env
chmod 600 "$TARGET_ENV_FILE" || true
echo "Wrote clean .env with selected variables to $TARGET_ENV_FILE"

# --- End extraction logic ---

# Ensure npm exists
if ! command -v npm >/dev/null 2>&1; then
    echo "npm is not installed or not on PATH. Please install Node.js/npm and try again." >&2
    exit 1
fi

# Run npm ci using the specified cache and prefer-offline
echo "Running 'npm ci' with cache at: $CACHE_DIR"
npm ci --cache "$CACHE_DIR" --prefer-offline

# Run android build
echo "Running 'npm run build:android'"
npm run build:android

echo "Done. Copy (or updated repo) is available at: $TARGET_DIR"
