---
name: knowledge-curation
description: Conventions for creating and curating vault markdown notes — generic frontmatter, file naming, deduplication, and Supabase sync hygiene.
---

# Knowledge curation

Every note in `knowledge/` is a plain markdown file with YAML frontmatter. Keep the format minimal and domain-agnostic.

## Required frontmatter
```yaml
---
title: <short human title>
category: <free text — user-defined, e.g. defect | standard | project | meeting>
tags: [tag1, tag2]
summary: <one line, <=160 chars; shown in Slack search results>
keywords: <extra search words not in title/summary>
created_at: <YYYY-MM-DD>
---
```

Optional: `metadata:` (YAML inline map) — stored in Supabase `metadata` jsonb for category-specific fields.

## File layout rules
- Path: `knowledge/<category>/<optional-year-or-project>/<slug>.md`
- `<slug>`: kebab-case, ASCII preferred for git-portability; short (≤ 60 chars).
- One concept per file. If a note exceeds ~500 lines, split.

## Deduplication
- Before creating: search Supabase index for similar `title` / `keywords`. If a 90%+ match exists, append to the existing note instead of creating a new one.
- `vault_path` is the unique key in Supabase. Renaming a file = update the row's `vault_path` (or delete+reinsert) — never leave orphans.

## What NOT to put in frontmatter
- Large structured data (dimensions tables, long bullet lists) → put in body.
- Binary data / images → store in `knowledge/_attachments/` and link.
- Author PII beyond an initial/handle.

## Body guidance
- Start with a 1-paragraph context block so someone unfamiliar can orient quickly.
- Use Markdown headings freely (not visible to Slack, but Obsidian renders them).
- Link between notes with `[[wikilink]]` (Obsidian) or `[text](../other.md)` (GitHub). Obsidian format is preferred inside the vault.

## Sync
After editing outside Claude (e.g., directly in Obsidian):
- Commit & push to GitHub
- Run `/kb-sync` to reconcile the Supabase index.
