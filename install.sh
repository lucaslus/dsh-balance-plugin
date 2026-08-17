#!/usr/bin/env bash
set -euo pipefail

# Install dsh-balance-plugin into a dsh profile from GitHub.
#   curl -fsSL https://raw.githubusercontent.com/lucaslus/dsh-balance-plugin/main/install.sh | bash
# or, with a different profile:
#   DSH_PROFILE=web bash install.sh

GITHUB_REPO="lucaslus/dsh-balance-plugin"
PROFILE="${DSH_PROFILE:-web}"

if ! command -v dsh >/dev/null 2>&1; then
  echo "error: 'dsh' command not found. Install DeepSeek Harness first." >&2
  exit 1
fi

echo "Installing ${GITHUB_REPO} into profile '${PROFILE}' ..."
dsh plugin --profile "${PROFILE}" add "github:${GITHUB_REPO}"

echo ""
echo "Installed. Restart the dsh client for the new plugin to load:"
echo "  dsh --profile ${PROFILE}"
