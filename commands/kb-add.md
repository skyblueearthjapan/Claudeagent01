---
description: Add a new note to the vault and index it in Supabase
argument-hint: <title> [--category X] [--tags a,b,c]
---

Create a new markdown note in the vault and register it in the Supabase index.

Steps:
1. Ask the user (briefly) for missing fields: category (free text), tags (comma-separated), one-line summary, keywords.
2. Determine `vault_path`: sanitize title → kebab-case filename under `knowledge/<category>/<YYYY>/<slug>.md`. Confirm the path with the user before writing.
3. Create the file from `templates/note.md`, filling frontmatter (`title`, `category`, `tags`, `summary`, `keywords`, `created_at`).
4. Commit to GitHub via the GitHub MCP (branch `main`, meaningful commit message).
5. Upsert into Supabase `documents` via the Supabase MCP — do NOT duplicate: key on `vault_path`.

Never auto-fill domain-specific fields. Leave body empty below the frontmatter — the user will fill content later, via Obsidian or Slack edits.
