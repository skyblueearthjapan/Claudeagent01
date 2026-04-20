---
description: Search the Supabase documents index and show matching vault files
argument-hint: <keywords> [--category X] [--tag Y] [--limit N]
---

Search the knowledge base. Use the Supabase MCP to call the `search_documents` RPC:

```sql
select * from search_documents(p_query := $1, p_category := $2, p_tag_any := $3, p_limit := $4);
```

Arguments from the user:
- `$1` free-text keywords (default: null)
- `--category X` → `$2` (default: null, matches all)
- `--tag Y` (can repeat) → `$3` as text[] (default: null)
- `--limit N` → `$4` (default: 20)

For each hit, show: `title`, `category`, `tags`, `vault_path`, 1-line `summary`. Then offer to open a specific `vault_path` with the filesystem MCP (vault server) for full content.

If zero hits, suggest broadening: drop the category filter, loosen tags, or try synonyms.
