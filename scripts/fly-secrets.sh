#!/usr/bin/env bash
# Set required Fly secrets from your local gitignored github.config.json
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f github.config.json ]]; then
  echo "Missing github.config.json — copy from github.config.example.json first."
  exit 1
fi
export PATH="${HOME}/.fly/bin:${PATH}"
CONFIG_JSON="$(jq -c 'del(._comment)' github.config.json)"
TOKEN="$(gh auth token)"
echo "Setting secrets on meta-os-dashboard-api…"
fly secrets set \
  "META_OS_GITHUB_TOKEN=${TOKEN}" \
  "META_OS_CONFIG_JSON=${CONFIG_JSON}" \
  --app meta-os-dashboard-api
echo "Done. Run: fly deploy --app meta-os-dashboard-api"