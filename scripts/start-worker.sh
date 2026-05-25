#!/bin/sh
set -e

rm -rf /app/marketing

echo "[worker] Cloning Zimplixio_Marketing @ ${MARKETING_REPO_REF:-main}..."
git clone \
  --depth 1 \
  --branch "${MARKETING_REPO_REF:-main}" \
  "https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO_PATH}.git" \
  /app/marketing

echo "[worker] Setting up Python venv..."
python3 -m venv /app/marketing/.venv
/app/marketing/.venv/bin/pip install --quiet -r /app/marketing/requirements.txt

export MARKETING_DIR=/app/marketing
echo "[worker] MARKETING_DIR=/app/marketing"

echo "[worker] Starting worker process..."
exec npm run worker
