#!/usr/bin/env bash
# ============================================================
# Claudeagent01 — VPS install script (Ubuntu 24.04)
# Run as root on the VPS after `git clone` into /opt/claudeagent01.
# ============================================================
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/claudeagent01}"
SERVICE_USER="${SERVICE_USER:-claudeagent}"
LOG_DIR="/var/log/claudeagent01"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 1
fi

echo "==> 1/8 apt prerequisites"
apt-get update -y
apt-get install -y --no-install-recommends ca-certificates curl git build-essential

echo "==> 2/8 Node.js 20 (if missing)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//;s/\..*//')" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 3/8 Claude Code CLI"
npm install -g @anthropic-ai/claude-code
claude --version || true

echo "==> 4/8 Service user"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> 5/8 Directories & permissions"
mkdir -p "$INSTALL_DIR" "$LOG_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" "$LOG_DIR"

echo "==> 6/8 Bot dependencies"
sudo -u "$SERVICE_USER" bash -lc "cd '$INSTALL_DIR/scripts' && npm install --omit=dev"

echo "==> 7/8 .env check"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env"
  echo "  Created $INSTALL_DIR/.env from template. Edit it before starting the service."
fi

echo "==> 8/8 systemd"
install -m 0644 "$INSTALL_DIR/systemd/claude-slack-bot.service" /etc/systemd/system/claude-slack-bot.service
systemctl daemon-reload
systemctl enable claude-slack-bot.service

cat <<EOF

------------------------------------------------------------
Install complete.

NEXT STEPS (manual, one-time):
  1) Authenticate Claude Code (interactive OAuth for Max plan):
       sudo -u $SERVICE_USER -H claude login
     (run from an SSH session with browser URL copy-paste)

  2) Edit secrets:
       nano $INSTALL_DIR/.env

  3) Start the service:
       systemctl start claude-slack-bot
       journalctl -u claude-slack-bot -f
------------------------------------------------------------
EOF
