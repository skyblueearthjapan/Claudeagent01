---
description: Stop the Claudeagent01 Slack bot service on the VPS
argument-hint: (no args)
---

Stop the Slack bot gracefully:

1. `ssh root@31.97.109.137 'systemctl stop claude-slack-bot'`
2. Verify stopped: `ssh root@31.97.109.137 'systemctl is-active claude-slack-bot'` (should print `inactive`)
3. Show the last 10 lines of the log so the user can confirm clean shutdown: `ssh root@31.97.109.137 'journalctl -u claude-slack-bot -n 10 --no-pager'`

Do not disable the service (only stop). Use `systemctl disable` only when the user explicitly asks to prevent boot-time auto-start.
