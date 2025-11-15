#!/bin/bash
# Initialize D1 using wrangler
set -e
if ! command -v wrangler >/dev/null 2>&1; then
  echo "Please install wrangler: https://developers.cloudflare.com/workers/cli-wrangler/"
  exit 1
fi
echo "Executing D1 schema..."
wrangler d1 execute --binding MUSIC_D1 --file d1_schema.sql
echo "Done."
