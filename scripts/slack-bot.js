// ============================================================
// Claudeagent01 — Slack Socket Mode Bot
// Proxies Slack messages/commands to Claude Code CLI (`claude -p`).
// Runs on VPS under systemd. Solo use — authenticate Claude via `claude login`.
// ============================================================

import 'dotenv/config';
import pkg from '@slack/bolt';
const { App, LogLevel } = pkg;
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const {
  SLACK_APP_TOKEN,
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  CLAUDE_BIN = '/usr/local/bin/claude',
  VAULT_PATH = '/opt/claudeagent01/knowledge',
  LOG_LEVEL = 'info',
  SESSION_TTL_MINUTES = '60',
} = process.env;

if (!SLACK_APP_TOKEN || !SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET) {
  console.error('Missing Slack credentials in .env');
  process.exit(1);
}

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
  logLevel: LogLevel[LOG_LEVEL.toUpperCase()] ?? LogLevel.INFO,
});

// thread_ts -> { sessionId, lastUsed }
const sessions = new Map();
const ttlMs = Number(SESSION_TTL_MINUTES) * 60 * 1000;

function pickSession(threadKey) {
  const now = Date.now();
  const existing = sessions.get(threadKey);
  if (existing && now - existing.lastUsed < ttlMs) {
    existing.lastUsed = now;
    return { sessionId: existing.sessionId, resumed: true };
  }
  const sessionId = randomUUID();
  sessions.set(threadKey, { sessionId, lastUsed: now });
  return { sessionId, resumed: false };
}

function sweepSessions() {
  const cutoff = Date.now() - ttlMs;
  for (const [k, v] of sessions) if (v.lastUsed < cutoff) sessions.delete(k);
}
setInterval(sweepSessions, 5 * 60 * 1000).unref();

// Spawn `claude -p` and stream final text back.
function runClaude({ prompt, sessionId, resume }) {
  return new Promise((res, rej) => {
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--cwd', resolve(VAULT_PATH),
    ];
    if (resume) args.push('--resume', sessionId);
    else args.push('--session-id', sessionId);

    const proc = spawn(CLAUDE_BIN, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', rej);
    proc.on('close', (code) => {
      if (code !== 0) return rej(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
      // Extract final assistant text from stream-json events.
      const text = stdout
        .split('\n')
        .map((l) => { try { return JSON.parse(l); } catch { return null; } })
        .filter((e) => e && e.type === 'assistant' && e.message?.content)
        .flatMap((e) => e.message.content.filter((c) => c.type === 'text').map((c) => c.text))
        .join('\n')
        .trim();
      res(text || '(empty response)');
    });
  });
}

// @mention → process in thread
app.event('app_mention', async ({ event, client, logger }) => {
  const threadKey = event.thread_ts ?? event.ts;
  const prompt = event.text.replace(/<@[^>]+>\s*/g, '').trim();
  if (!prompt) return;

  await client.reactions.add({ channel: event.channel, timestamp: event.ts, name: 'hourglass_flowing_sand' }).catch(() => {});

  try {
    const { sessionId, resumed } = pickSession(threadKey);
    const text = await runClaude({ prompt, sessionId, resume: resumed });
    await client.chat.postMessage({ channel: event.channel, thread_ts: threadKey, text });
    await client.reactions.remove({ channel: event.channel, timestamp: event.ts, name: 'hourglass_flowing_sand' }).catch(() => {});
    await client.reactions.add({ channel: event.channel, timestamp: event.ts, name: 'white_check_mark' }).catch(() => {});
  } catch (err) {
    logger.error(err);
    await client.chat.postMessage({ channel: event.channel, thread_ts: threadKey, text: `:warning: Claude error: \`${err.message}\`` });
  }
});

// Slash commands
app.command('/claude-status', async ({ ack, respond }) => {
  await ack();
  const lines = ['*Active sessions:* ' + sessions.size];
  for (const [k, v] of sessions) {
    lines.push(`• thread \`${k}\` — session \`${v.sessionId.slice(0, 8)}\` — idle ${Math.round((Date.now() - v.lastUsed) / 1000)}s`);
  }
  await respond({ response_type: 'ephemeral', text: lines.join('\n') });
});

app.command('/claude-stop', async ({ ack, respond, command }) => {
  await ack();
  const key = command.thread_ts ?? command.channel_id;
  const existed = sessions.delete(key);
  await respond({ response_type: 'ephemeral', text: existed ? `Session cleared for \`${key}\`.` : 'No active session here.' });
});

app.command('/claude-reset', async ({ ack, respond }) => {
  await ack();
  const n = sessions.size;
  sessions.clear();
  await respond({ response_type: 'ephemeral', text: `Cleared ${n} session(s).` });
});

// Startup
(async () => {
  await app.start();
  console.log(`[claudeagent01] Slack bot up (Socket Mode). vault=${VAULT_PATH}  claude=${CLAUDE_BIN}`);
})().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => { await app.stop(); process.exit(0); });
process.on('SIGINT',  async () => { await app.stop(); process.exit(0); });
