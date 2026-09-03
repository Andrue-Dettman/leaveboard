#!/usr/bin/env bash
# Fail if AI attribution appears in commit messages or tracked files. This repository is
# a portfolio piece; the rule is documented in CLAUDE.md and docs/DESIGN.md section 6.9.
set -uo pipefail

pattern='co-authored-by: claude|generated with \[claude|claude-session|claude\.ai/code|noreply@anthropic\.com'
status=0

# These files state the policy, so they quote the strings the policy forbids.
exclusions=(
  ':!.github/scripts/check-attribution.sh'
  ':!.githooks/commit-msg'
  ':!.claude/skills/pr-review/SKILL.md'
  ':!CLAUDE.md'
  ':!docs/DESIGN.md'
)

if [ -n "${GITHUB_BASE_REF:-}" ]; then
  git fetch --quiet origin "${GITHUB_BASE_REF}"
  range="origin/${GITHUB_BASE_REF}..HEAD"
else
  range="HEAD"
fi

echo "Scanning commit messages in ${range}"
if git log --format='%B' "${range}" | grep -inE "${pattern}"; then
  echo "::error::AI attribution found in a commit message. Rewrite the branch before merging."
  status=1
fi

echo "Scanning tracked files"
if git grep -inE "${pattern}" -- . "${exclusions[@]}"; then
  echo "::error::AI attribution found in a tracked file."
  status=1
fi

if [ "${status}" -eq 0 ]; then
  echo "Clean."
fi

exit "${status}"
