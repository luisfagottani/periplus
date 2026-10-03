#!/usr/bin/env bash
# Applies repository settings, rulesets, labels and the npm-publish environment.
# Idempotent; requires `gh` authenticated as a repository admin.
#
# Usage: scripts/setup-repo.sh [owner/repo]
# Optional: RELEASE_APP_ID=<id> lets the release GitHub App create release tags.
set -euo pipefail

REPO="${1:-luisfagottani/periplus}"
OWNER="${REPO%%/*}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ repository settings"
gh api -X PATCH "repos/$REPO" --silent \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY \
  -F delete_branch_on_merge=true \
  -F allow_auto_merge=true \
  -F allow_update_branch=true \
  -F has_discussions=true \
  -F has_wiki=false \
  -F has_projects=false

echo "→ security: Dependabot alerts, private vulnerability reporting, secret scanning"
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" --silent
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

echo "→ actions: read-only GITHUB_TOKEN, no PR approvals, approval for fork workflows"
gh api -X PUT "repos/$REPO/actions/permissions/workflow" --silent \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false
gh api -X PUT "repos/$REPO/actions/permissions/fork-pr-contributor-approval" --silent \
  -f approval_policy=all_external_contributors

echo "→ environment npm-publish (owner approval required)"
OWNER_ID="$(gh api "users/$OWNER" --jq .id)"
gh api -X PUT "repos/$REPO/environments/npm-publish" --silent --input - <<JSON
{
  "reviewers": [{ "type": "User", "id": $OWNER_ID }],
  "prevent_self_review": false,
  "deployment_branch_policy": null
}
JSON

echo "→ rulesets"
apply_ruleset() {
  local file="$1" body name id
  body="$(cat "$file")"
  if [[ "$(basename "$file")" == "release-tags.json" && -n "${RELEASE_APP_ID:-}" ]]; then
    body="$(node -e '
      const ruleset = JSON.parse(process.argv[1]);
      ruleset.bypass_actors.push({ actor_id: Number(process.argv[2]), actor_type: "Integration", bypass_mode: "always" });
      console.log(JSON.stringify(ruleset));
    ' "$body" "$RELEASE_APP_ID")"
  fi
  name="$(node -p 'JSON.parse(process.argv[1]).name' "$body")"
  id="$(gh api "repos/$REPO/rulesets" --jq ".[] | select(.name == \"$name\") | .id")"
  if [[ -n "$id" ]]; then
    gh api -X PUT "repos/$REPO/rulesets/$id" --silent --input - <<<"$body"
    echo "  updated: $name"
  else
    gh api -X POST "repos/$REPO/rulesets" --silent --input - <<<"$body"
    echo "  created: $name"
  fi
}
for file in "$ROOT"/.github/rulesets/*.json; do
  apply_ruleset "$file"
done

echo "→ labels"
label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; echo "  $1"; }
label "bug" "d73a4a" "Something is not working"
label "enhancement" "a2eeef" "New feature or request"
label "documentation" "0075ca" "Improvements or additions to documentation"
label "good first issue" "7057ff" "Good for newcomers"
label "help wanted" "008672" "Extra attention is needed"
label "needs-triage" "fbca04" "Waiting for a maintainer to triage"
label "release:alpha" "5319e7" "Publish an alpha snapshot of this PR to npm"
label "breaking" "b60205" "Introduces a breaking change"
label "pinned" "0e8a16" "Never marked as stale"
label "security" "ee0701" "Security related"

echo "✓ done. Remaining manual steps are listed in CONTRIBUTING.md (maintainers section)."
