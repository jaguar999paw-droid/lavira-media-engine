#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  sync.sh — Lavira Media Engine: Local ↔ GitHub sync with optional release tag
#
#  Usage:
#    ./sync.sh                    # pull + push (no tag)
#    ./sync.sh --release          # pull + push + auto-bump patch tag (v1.x.y+1)
#    ./sync.sh --release v1.4.1   # pull + push + specific tag
#    ./sync.sh --pull-only        # pull remote changes only (safe on prod)
#    ./sync.sh --status           # just show diff/log, no push
#
#  What it does:
#    1. Stash any dirty working tree
#    2. Pull --rebase from origin/main
#    3. Pop stash (if any)
#    4. Stage all changes (git add -A), skip if nothing to commit
#    5. Commit with auto-generated message listing changed files
#    6. Push to origin/main
#    7. If --release: create + push an annotated version tag
#       → triggers windows-package.yml CI to build + publish the release ZIP
#    8. Print tailnet status so you can watch for a new lavira-win-* node
#
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE="origin"
BRANCH="main"

# ── colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step()  { echo -e "${CYAN}[sync]${NC} $*"; }
ok()    { echo -e "${GREEN}  ✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}  !${NC}  $*"; }
fail()  { echo -e "${RED}  ✗${NC}  $*"; exit 1; }
header(){ echo -e "\n${BOLD}$*${NC}"; }

# ── arg parsing ───────────────────────────────────────────────────────────────
MODE="sync"          # sync | pull-only | status
RELEASE_TAG=""       # empty = no tag; "auto" = bump patch; "v*" = explicit

while [[ $# -gt 0 ]]; do
  case $1 in
    --release)
      MODE="sync"
      RELEASE_TAG="${2:-auto}"
      [[ "${RELEASE_TAG}" == --* ]] && RELEASE_TAG="auto"  # next arg is another flag
      shift; [[ "${RELEASE_TAG}" != "auto" && "${RELEASE_TAG:0:1}" == "v" ]] && shift || true
      ;;
    --pull-only) MODE="pull-only"; shift ;;
    --status)    MODE="status"; shift ;;
    -h|--help)
      grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
      exit 0 ;;
    *) warn "Unknown argument: $1"; shift ;;
  esac
done

cd "$REPO_DIR"

# ── preflight checks ──────────────────────────────────────────────────────────
header "── Lavira sync.sh ────────────────────────────────────────────────────"
step "Repo:   $REPO_DIR"
step "Remote: $(git remote get-url $REMOTE 2>/dev/null || echo '(not set)')"
step "Branch: $BRANCH"
step "Mode:   $MODE${RELEASE_TAG:+ → release ${RELEASE_TAG}}"
echo ""

command -v git  >/dev/null || fail "git not found"
git rev-parse --is-inside-work-tree &>/dev/null || fail "Not a git repo: $REPO_DIR"

# ── STATUS mode ───────────────────────────────────────────────────────────────
if [[ "$MODE" == "status" ]]; then
  header "── Working tree ──────────────────────────────────────────────────────"
  git status --short
  echo ""
  header "── Recent commits ───────────────────────────────────────────────────"
  git log --oneline -8
  echo ""
  header "── Diff from origin/main ────────────────────────────────────────────"
  git fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null || warn "fetch failed"
  git diff --stat "$REMOTE/$BRANCH" HEAD 2>/dev/null || true
  exit 0
fi

# ── STEP 1: stash dirty tree ─────────────────────────────────────────────────
STASH_NEEDED=false
if ! git diff --quiet || ! git diff --cached --quiet; then
  step "Stashing working tree changes..."
  git stash push -u -m "sync.sh auto-stash $(date '+%Y-%m-%d %H:%M:%S')"
  STASH_NEEDED=true
  ok "Changes stashed"
fi

# ── STEP 2: pull --rebase ─────────────────────────────────────────────────────
step "Pulling from $REMOTE/$BRANCH (rebase)..."
if git fetch "$REMOTE" "$BRANCH" --quiet 2>/dev/null; then
  LOCAL=$(git rev-parse HEAD)
  UPSTREAM=$(git rev-parse "$REMOTE/$BRANCH" 2>/dev/null || echo "")
  if [[ -n "$UPSTREAM" && "$LOCAL" != "$UPSTREAM" ]]; then
    git rebase "$REMOTE/$BRANCH" || {
      warn "Rebase conflict. Aborting rebase and continuing with local state."
      git rebase --abort 2>/dev/null || true
    }
    ok "Pulled latest changes"
  else
    ok "Already up to date with $REMOTE/$BRANCH"
  fi
else
  warn "Could not reach $REMOTE — skipping pull (working offline)"
fi

# ── STEP 3: pop stash ────────────────────────────────────────────────────────
if [[ "$STASH_NEEDED" == "true" ]]; then
  step "Restoring stashed changes..."
  git stash pop || warn "Stash pop had conflicts — review manually"
  ok "Stash restored"
fi

# ── PULL-ONLY exits here ──────────────────────────────────────────────────────
if [[ "$MODE" == "pull-only" ]]; then
  ok "Pull-only complete."
  exit 0
fi

# ── STEP 4: stage all changes ─────────────────────────────────────────────────
step "Staging changes..."
git add -A

STAGED=$(git diff --cached --name-only)
if [[ -z "$STAGED" ]]; then
  ok "Nothing to commit — working tree clean"
else
  # Build a concise auto-commit message
  CHANGED_COUNT=$(echo "$STAGED" | wc -l | tr -d ' ')
  FIRST_FILES=$(echo "$STAGED" | head -3 | tr '\n' ' ')
  AUTO_MSG="chore: sync $(date '+%Y-%m-%d %H:%M') — ${CHANGED_COUNT} file(s): ${FIRST_FILES}..."

  step "Committing: $AUTO_MSG"
  git commit -m "$AUTO_MSG"
  ok "Committed"
fi

# ── STEP 5: push ─────────────────────────────────────────────────────────────
step "Pushing to $REMOTE/$BRANCH..."
if git push "$REMOTE" "$BRANCH" 2>&1; then
  ok "Pushed to $REMOTE/$BRANCH"
else
  warn "Push failed — trying with --force-with-lease (safe force)..."
  git push --force-with-lease "$REMOTE" "$BRANCH" && ok "Force-pushed OK" || fail "Push failed. Resolve conflicts manually."
fi

# ── STEP 6: release tag ───────────────────────────────────────────────────────
if [[ -n "$RELEASE_TAG" ]]; then
  echo ""
  header "── Release tag ──────────────────────────────────────────────────────"

  if [[ "$RELEASE_TAG" == "auto" ]]; then
    # Auto-bump patch version from latest tag
    LATEST=$(git tag --list 'v*' --sort=-v:refname | head -1)
    if [[ -z "$LATEST" ]]; then
      RELEASE_TAG="v1.0.0"
    else
      # Parse vMAJOR.MINOR.PATCH
      IFS='.' read -r MAJOR MINOR PATCH <<< "${LATEST#v}"
      PATCH=$(( PATCH + 1 ))
      RELEASE_TAG="v${MAJOR}.${MINOR}.${PATCH}"
    fi
    ok "Auto-bumped to $RELEASE_TAG (was ${LATEST:-none})"
  fi

  # Check tag doesn't already exist
  if git tag --list | grep -q "^${RELEASE_TAG}$"; then
    warn "Tag $RELEASE_TAG already exists — skipping tag creation"
  else
    step "Creating annotated tag $RELEASE_TAG..."
    git tag -a "$RELEASE_TAG" -m "Release $RELEASE_TAG — $(date '+%Y-%m-%d')

Auto-tagged by sync.sh. See commit history for full changelog.
Windows ZIP built by CI: .github/workflows/windows-package.yml
"
    ok "Tag $RELEASE_TAG created"

    step "Pushing tag $RELEASE_TAG..."
    git push "$REMOTE" "$RELEASE_TAG"
    ok "Tag pushed → GitHub Actions will now build lavira-media-engine-windows-setup.zip"

    echo ""
    echo -e "  ${BOLD}CI workflow triggered.${NC}"
    echo -e "  Watch progress at:"
    REPO_URL=$(git remote get-url origin | sed 's/git@github.com:/https:\/\/github.com\//' | sed 's/\.git$//')
    echo -e "  ${CYAN}${REPO_URL}/actions${NC}"
    echo ""
    echo -e "  Release will appear at:"
    echo -e "  ${CYAN}${REPO_URL}/releases/tag/${RELEASE_TAG}${NC}"
  fi
fi

# ── STEP 7: tailnet snapshot ──────────────────────────────────────────────────
echo ""
header "── Tailnet snapshot (watching for new lavira-win-* nodes) ──────────"
if command -v tailscale &>/dev/null; then
  tailscale status 2>/dev/null | grep -v '^#' | awk '{
    status = ($5 == "active" || $5 == "") ? "\033[0;32m● online\033[0m" : "\033[0;90m○ " $5 " " $6 "\033[0m"
    printf "  %-22s %-16s %s\n", $2, $1, status
  }'
  echo ""
  WINDOWS_NODES=$(tailscale status 2>/dev/null | grep -i 'windows' | grep -v 'offline' | wc -l | tr -d ' ')
  OFFLINE_WIN=$(tailscale status 2>/dev/null | grep -i 'windows' | grep 'offline' | wc -l | tr -d ' ')
  echo -e "  Windows nodes online:  ${BOLD}${WINDOWS_NODES}${NC}"
  echo -e "  Windows nodes offline: ${OFFLINE_WIN}"
  echo ""
  echo -e "  ${YELLOW}When a client runs Install-Lavira.bat, a new node named${NC}"
  echo -e "  ${CYAN}lavira-win-<computername>${NC}${YELLOW} will appear above as online.${NC}"
  echo -e "  Re-run ${CYAN}./sync.sh --status${NC} or ${CYAN}tailscale status${NC} to check."
else
  warn "tailscale not in PATH — skipping tailnet snapshot"
fi

echo ""
ok "sync.sh complete."
