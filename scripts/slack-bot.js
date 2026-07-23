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
import { resolve, basename } from 'node:path';
import { statSync, createReadStream, readdirSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';

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
      '--dangerously-skip-permissions',
      '--model', 'claude-opus-4-8',
    ];
    if (resume) args.push('--resume', sessionId);
    else args.push('--session-id', sessionId);

    const proc = spawn(CLAUDE_BIN, args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: resolve(VAULT_PATH),
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


// Snapshot files under /opt/claudeagent01/generated-* (name -> mtime).
const GENERATED_ROOTS = [
  '/opt/claudeagent01/generated-images',
  '/opt/claudeagent01/generated-ppt',
  '/opt/claudeagent01/generated-word',
  '/opt/claudeagent01/generated-excel',
];
function snapshotGenerated() {
  const map = new Map();
  for (const root of GENERATED_ROOTS) {
    let names = [];
    try { names = readdirSync(root); } catch { continue; }
    for (const n of names) {
      const p = root + '/' + n;
      try { const st = statSync(p); if (st.isFile()) map.set(p, st.mtimeMs); } catch {}
    }
  }
  return map;
}
function diffGenerated(before) {
  const after = snapshotGenerated();
  const changed = [];
  for (const [p, m] of after) if (!before.has(p) || before.get(p) !== m) changed.push(p);
  return changed;
}

// Download Slack-attached files to a temp dir so Claude can read them.
// Returns { dir, files: [{ path, name, mime }] }. Caller must call cleanupTempDir(dir).
async function downloadSlackFiles(files, logger) {
  if (!files || !files.length) return { dir: null, files: [] };
  const dir = `${tmpdir()}/claude-slack-${randomUUID()}`;
  await fsp.mkdir(dir, { recursive: true });
  const out = [];
  for (const f of files) {
    const url = f.url_private_download || f.url_private;
    if (!url) continue;
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const safe = (f.name || f.id).replace(/[^\w.\-\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '_');
      const p = `${dir}/${safe}`;
      await fsp.writeFile(p, buf);
      out.push({ path: p, name: f.name || safe, mime: f.mimetype || 'application/octet-stream' });
    } catch (e) {
      if (logger?.error) logger.error(`slack file download failed (${f.name || f.id}): ${e.message}`);
    }
  }
  return { dir, files: out };
}

async function cleanupTempDir(dir) {
  if (!dir) return;
  try { await fsp.rm(dir, { recursive: true, force: true }); } catch {}
}

async function uploadFilesToSlack({ client, channel, paths, logger }) {
  for (const p of paths) {
    try {
      await client.files.uploadV2({
        channel_id: channel,
        file: createReadStream(p),
        filename: basename(p),
        initial_comment: basename(p),
      });
    } catch (e) {
      if (logger && logger.error) logger.error(`upload failed ${p}: ${e.message}`);
    }
  }
}

// Shared handler — posts flat (no threading), session keyed by channel for continuity
async function handlePrompt({ channel, ts, text, files, client, logger }) {
  const baseText = (text || '').replace(/<@[^>]+>\s*/g, '').trim();
  const { dir: tmpDir, files: downloaded } = await downloadSlackFiles(files, logger);

  let prompt = baseText;
  if (downloaded.length) {
    const list = downloaded.map(f => `- \`${f.path}\` (${f.mime}, 元ファイル名: ${f.name})`).join('\n');
    const body = baseText || '(本文なし — 添付の内容を確認してください)';
    prompt = `${body}\n\n---\n【Slack添付ファイル — 処理後に自動削除されます】\n${list}\n\n上記ファイルを必要に応じて読み取り、内容を踏まえて回答してください。重要なデータは vault（knowledge/）/ GitHub / Supabase のいずれかへ保存するよう提案してください。`;
  }

  if (!prompt) { await cleanupTempDir(tmpDir); return; }

  await client.reactions.add({ channel, timestamp: ts, name: 'hourglass_flowing_sand' }).catch(() => {});

  try {
    const { sessionId, resumed } = pickSession(channel);
    const before = snapshotGenerated();
    const replyText = await runClaude({ prompt, sessionId, resume: resumed });
    const newFiles = diffGenerated(before);
    await client.chat.postMessage({ channel, text: replyText });
    if (newFiles.length) await uploadFilesToSlack({ client, channel, paths: newFiles, logger });
    await client.reactions.remove({ channel, timestamp: ts, name: 'hourglass_flowing_sand' }).catch(() => {});
    await client.reactions.add({ channel, timestamp: ts, name: 'white_check_mark' }).catch(() => {});
  } catch (err) {
    logger.error(err);
    await client.chat.postMessage({ channel, text: `:warning: Claude error: \`${err.message}\`` });
  } finally {
    await cleanupTempDir(tmpDir);
  }
}

// @mention in channels
app.event('app_mention', async ({ event, client, logger }) => {
  await handlePrompt({ channel: event.channel, ts: event.ts, text: event.text, files: event.files, client, logger });
});

// Direct messages (1:1 DM to the bot)
app.event('message', async ({ event, client, logger }) => {
  if (event.channel_type !== 'im') return;
  if (event.bot_id) return;
  // Allow file_share subtype so image/file-only messages reach the bot.
  if (event.subtype && event.subtype !== 'file_share') return;
  const hasFiles = Array.isArray(event.files) && event.files.length > 0;
  if (!event.text && !hasFiles) return;
  await handlePrompt({ channel: event.channel, ts: event.ts, text: event.text, files: event.files, client, logger });
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
