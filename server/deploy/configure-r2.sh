#!/usr/bin/env bash
# Owner runs this in an interactive SSH terminal. Secrets never appear in argv or output.
set -euo pipefail
test "$EUID" -eq 0 || { printf 'Run as root.\n'; exit 1; }
umask 077
printf 'BlackCat SCRM private R2 cloud backup setup\nUse a private Standard bucket dedicated to BlackCat. Keep public access disabled.\n'
IFS= read -r -p 'Cloudflare account ID: ' account </dev/tty
IFS= read -r -p 'Private bucket name: ' bucket </dev/tty
IFS= read -r -s -p 'R2 Access Key ID (hidden): ' access </dev/tty; printf '\n'
IFS= read -r -s -p 'R2 Secret Access Key (hidden): ' secret </dev/tty; printf '\n'
[[ "$account" =~ ^[a-f0-9]{32}$ && "$bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ && "$access" =~ ^[A-Za-z0-9_-]+$ && "$secret" =~ ^[A-Za-z0-9_+/=-]+$ ]] || { printf 'Invalid values; nothing changed.\n'; exit 1; }
install -d -m 0750 -o root -g blackcat /etc/blackcat-server
temp=$(mktemp /etc/blackcat-server/r2.env.XXXXXX)
trap 'unset account bucket access secret; test -z "$temp" || rm -f -- "$temp"' EXIT
printf 'R2_ACCOUNT_ID=%s\nR2_BUCKET=%s\nR2_ACCESS_KEY_ID=%s\nR2_SECRET_ACCESS_KEY=%s\nR2_TOTAL_LIMIT_BYTES=9000000000\nR2_MONTHLY_A_LIMIT=800000\nR2_MONTHLY_B_LIMIT=8000000\n' "$account" "$bucket" "$access" "$secret" > "$temp"
unset account bucket access secret
chmod 0600 "$temp"
# Verify PUT/GET/DELETE before replacing a working configuration. Only synthetic bytes are used.
R2_CHECK_ENV="$temp" /opt/blackcat-node/bin/node /opt/blackcat-server/current/server/scripts/check-r2.cjs
mv -f -- "$temp" /etc/blackcat-server/r2.env
temp=''
systemctl restart blackcat-server
systemctl is-active --quiet blackcat-server
printf 'R2 connected. Global trial cap: 9 GB; monthly request guards enabled.\n'
