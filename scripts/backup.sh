#!/usr/bin/env bash
# Back up the game database to ./backups on the host, keeping the newest $KEEP copies.
# Run from the repo directory. Suggested crontab (daily at 4am):
#   0 4 * * * cd /opt/assassins && ./scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
KEEP="${KEEP:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
docker compose exec -T app node scripts/backup.cjs "/data/backups/assassins-$STAMP.db"
docker compose cp "app:/data/backups/assassins-$STAMP.db" "backups/assassins-$STAMP.db"
docker compose exec -T app rm -f "/data/backups/assassins-$STAMP.db"
ls -1t backups/assassins-*.db | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Saved backups/assassins-$STAMP.db"
