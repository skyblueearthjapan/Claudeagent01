---
description: Show Claudeagent01 bot status, resource usage, and recent logs
argument-hint: [--lines N]
---

Report current state of the Slack bot on the VPS:

1. Service state: `ssh root@31.97.109.137 'systemctl status claude-slack-bot --no-pager -l | head -20'`
2. Memory/CPU of the node process: `ssh root@31.97.109.137 'ps -C node -o pid,rss,%cpu,etime,cmd --no-headers'`
3. Recent logs (default 50, or `--lines N` from user): `ssh root@31.97.109.137 'journalctl -u claude-slack-bot -n ${N:-50} --no-pager'`
4. Active Slack→Claude sessions (pattern match): grep for `pickSession` or session-related log lines in the tail

Present a short summary: active/inactive, uptime, RSS memory, last error (if any).
