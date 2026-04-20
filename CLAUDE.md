# Claudeagent01 — Slack Knowledge Base Plugin

This repo is both a **Claude Code plugin** and the **runtime deployment** for a Slack-integrated knowledge base on a VPS.

## Architecture

```
Slack user
   │  message / slash command
   ▼
Slack Bot (Socket Mode, Node.js @slack/bolt, on VPS)
   │  spawn child process
   ▼
claude -p "<prompt>" --output-format stream-json
   │  MCP connections
   ├─ Slack MCP         ← read thread, post reply, search channels
   ├─ Supabase MCP      ← query documents index
   ├─ GitHub MCP        ← read/write vault markdown
   └─ Filesystem MCP    ← direct read under knowledge/ (vault)
```

**Auth**: Claude Code CLI uses OAuth via `claude login` (Max plan). API key is NOT used for Claude itself. APIs for Slack/Supabase/GitHub use tokens in `.env`.

**Solo use only**. Do not expose the bot to users outside the contract holder.

## Knowledge model

- **Supabase `documents` table** = the index / catalog. Fast tag/keyword search.
- **`knowledge/` folder (GitHub repo = Obsidian vault)** = source of truth for content.
- **Flow**: Slack query → Claude queries Supabase → identifies relevant `vault_path` entries → reads the markdown files → synthesizes reply in Slack.

Categories (`defect`, `standard`, `project`, etc.) are **free text** chosen by the operator. The plugin does not hardcode domain structure.

## When working in this repo

- **Do not add domain-specific folder hardcoding** (e.g., `10_設計基準/`, `20_不具合DB/`). Those belong in the user's deployed `knowledge/` tree, not in plugin code.
- Keep templates generic — frontmatter only (`title`, `category`, `tags`, `summary`, `created_at`). No prescribed headings inside the body.
- When touching the bot (`scripts/slack-bot.js`): always preserve Socket Mode (no inbound HTTP), Signing Secret verification, and per-thread session isolation.
- When touching Supabase schema: keep `category` as free text, not enum. Add migrations under `supabase/migrations/` rather than editing `schema.sql` retroactively once deployed.

## Deployment

See `README.md` for VPS setup, Slack App creation, and systemd installation.
