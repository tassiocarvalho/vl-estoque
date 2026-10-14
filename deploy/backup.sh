#!/usr/bin/env bash
# Backup diário do banco (cópia independente do Neon), guardando os últimos 14 dias.
# Restaurar: pg_restore --clean --no-owner -d "$DATABASE_URL" <arquivo.dump>
set -euo pipefail

BACKUP_DIR=${BACKUP_DIR:-/var/backups/vl-estoque}
KEEP_DAYS=${KEEP_DAYS:-14}
file="$BACKUP_DIR/vl-estoque-$(date +%Y-%m-%d_%H%M).dump"

# O pg_dump não entende parâmetros só do Prisma (ex.: schema=public).
db_url=$(sed -E 's/[&?]schema=[^&]*//' <<<"$DATABASE_URL")

umask 077
pg_dump --format=custom --no-owner --dbname="$db_url" --file="$file.tmp"
mv "$file.tmp" "$file"
find "$BACKUP_DIR" -name 'vl-estoque-*.dump' -mtime "+$KEEP_DAYS" -delete
echo "Backup salvo: $file ($(du -h "$file" | cut -f1))"
