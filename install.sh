#!/usr/bin/env bash
set -euo pipefail

# Install dsh-balance-plugin into a dsh profile from GitHub.
#   curl -fsSL https://raw.githubusercontent.com/lucaslus/dsh-balance-plugin/main/install.sh | bash
# or, with a different profile:
#   DSH_PROFILE=web bash install.sh

GITHUB_REPO="lucaslus/dsh-balance-plugin"
PROFILE="${DSH_PROFILE:-web}"
DSH_NPM_PACKAGE="@deepseek-ai/dsh"

# Resolve a runnable dsh: prefer the installed CLI; when it is missing, fall
# back to `npx` (the harness ships its CLI as the @deepseek-ai/dsh npm
# package, whose bin is `dsh`) so the plugin still installs on machines
# without a system-wide dsh command.
if command -v dsh >/dev/null 2>&1; then
  DSH_CMD=(dsh)
  HINT_CMD="dsh"
elif command -v npx >/dev/null 2>&1; then
  echo "'dsh' not found; falling back to 'npx --yes ${DSH_NPM_PACKAGE}' ..."
  DSH_CMD=(npx --yes "${DSH_NPM_PACKAGE}")
  HINT_CMD="npx --yes ${DSH_NPM_PACKAGE}"
else
  echo "error: neither 'dsh' nor 'npx' found. Install Node.js (for npx) or DeepSeek Harness first." >&2
  exit 1
fi

echo "Installing ${GITHUB_REPO} into profile '${PROFILE}' ..."
"${DSH_CMD[@]}" plugin --profile "${PROFILE}" add "github:${GITHUB_REPO}"

echo ""
echo "Installed. Restart the dsh client for the new plugin to load:"
echo "  ${HINT_CMD} --profile ${PROFILE}"
