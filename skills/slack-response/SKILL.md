---
name: slack-response
description: Guidelines for formatting replies posted to Slack — respects mrkdwn syntax, thread etiquette, and message length limits.
---

# Slack response formatting

When Claude produces text that will be posted back to Slack, follow these rules:

## Length
- Hard cap ~3000 characters per message (Slack limit is 40k but long walls scroll badly).
- If longer, split by logical section and post multiple messages in the same thread — DO NOT attach as a file unless the user asks.

## Syntax (Slack mrkdwn, NOT full Markdown)
- Bold: `*text*` (single asterisks) — NOT `**text**`
- Italic: `_text_`
- Strike: `~text~`
- Inline code: `` `code` ``
- Block code: ` ```lang\n...\n``` `
- Lists: `• item` or `- item` (no nested indentation rendering)
- Links: `<https://url|label>`
- User mentions: `<@U12345>`
- Channel mentions: `<#C12345>`

## Thread etiquette
- Always reply in the thread where the user pinged (`thread_ts` of incoming event).
- Do NOT broadcast long results to the channel (`reply_broadcast: false` unless explicitly asked).
- Use reactions for quick ack: :hourglass_flowing_sand: while working, :white_check_mark: when done.

## Knowledge-base answers
When answering from the knowledge base, include:
1. 1-line direct answer
2. Source citations as `<https://github.com/skyblueearthjapan/Claudeagent01/blob/main/knowledge/PATH|vault_path>` links
3. If multiple hits, numbered list with `title` + short summary.

## Errors
On failure, post a concise message starting with `:warning:` and the specific error (not a stack trace). Never leak `.env` values, tokens, or file paths outside `/opt/claudeagent01/`.
