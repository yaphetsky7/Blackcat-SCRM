#!/usr/bin/env bash
# Run manually from an interactive SSH terminal. No key is passed in argv or logs.
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
    printf 'Please run with sudo.\n' >&2
    exit 1
fi
umask 077
printf 'BlackCat cloud server - Claude API key\n'
printf 'Paste your existing Claude API key. Input is hidden.\n'
IFS= read -r -s -p 'Claude API Key: ' claude_key </dev/tty
printf '\n'
if [[ ! $claude_key =~ ^sk-ant-[A-Za-z0-9_-]+$ ]]; then
    unset claude_key
    printf 'Invalid key format; no configuration changed.\n' >&2
    exit 1
fi
install -d -o root -g blackcat -m 0750 /etc/blackcat-server
key_temp=$(mktemp /etc/blackcat-server/claude.env.XXXXXX)
trap 'unset claude_key; test -z "$key_temp" || rm -f -- "$key_temp"' EXIT
printf 'ANTHROPIC_API_KEY=%s\n' "$claude_key" > "$key_temp"
unset claude_key
chmod 0600 "$key_temp"
mv -f -- "$key_temp" /etc/blackcat-server/claude.env
key_temp=''
systemctl restart blackcat-server
systemctl is-active --quiet blackcat-server
printf 'SUCCESS. Claude key saved only on your Linode server.\n'
read -r -p 'Press Enter to close this window.' </dev/tty || true
