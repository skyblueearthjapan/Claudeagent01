---
description: Start the Claudeagent01 Slack bot service on the VPS
argument-hint: (no args)
---

Start the Slack bot systemd service and show the live log tail. Steps:

1. Confirm SSH reachability: `ssh root@31.97.109.137 'uptime'`
2. Start service: `ssh root@31.97.109.137 'systemctl start claude-slack-bot'`
3. Verify: `ssh root@31.97.109.137 'systemctl is-active claude-slack-bot'`
4. Tail 30 lines: `ssh root@31.97.109.137 'journalctl -u claude-slack-bot -n 30 --no-pager'`

Report the status and any error lines from the tail. If the service is `failed`, run `systemctl status claude-slack-bot --no-pager -l` and analyze the cause before restarting.
