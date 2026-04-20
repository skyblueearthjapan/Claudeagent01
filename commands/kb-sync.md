---
description: Reconcile the Supabase index with the current vault contents
argument-hint: [--dry]
---

Full resync — useful after bulk edits in Obsidian or git pulls.

1. On the VPS, run: `ssh root@31.97.109.137 'sudo -u claudeagent bash -lc "cd /opt/claudeagent01/scripts && node sync-supabase.js --vault /opt/claudeagent01/knowledge ${DRY:+--dry}"'`
   - Pass `--dry` from the user through unchanged to preview without writing.
2. Report counts: found / skipped (missing frontmatter) / upserted.
3. If any skipped files are listed, suggest adding `title` + `category` frontmatter to those files.

This script is idempotent and uses `vault_path` as the conflict key.
