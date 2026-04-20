// ============================================================
// sync-supabase.js — Walk knowledge/*.md, upsert into documents table.
// Markdown files must have YAML frontmatter: title, category, tags, summary, keywords.
// Usage:  node sync-supabase.js [--vault ./knowledge] [--dry]
// ============================================================

import 'dotenv/config';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') || !arr[i + 1] ? true : arr[i + 1]]);
    return acc;
  }, []),
);

const VAULT = args.vault || process.env.VAULT_PATH || './knowledge';
const DRY = !!args.dry;

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!DRY && (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required (or use --dry).');
  process.exit(1);
}

const sb = DRY ? null : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { yield* walk(p); continue; }
    if (e.isFile() && p.endsWith('.md')) yield p;
  }
}

function parseFrontmatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { frontmatter: {}, body: src };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let [, k, v] = kv;
    v = v.trim();
    if (v.startsWith('[') && v.endsWith(']')) {
      v = v.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    } else if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fm[k] = v;
  }
  return { frontmatter: fm, body: src.slice(m[0].length) };
}

async function main() {
  const rows = [];
  for await (const file of walk(VAULT)) {
    const src = await readFile(file, 'utf8');
    const { frontmatter: fm } = parseFrontmatter(src);
    if (!fm.title || !fm.category) {
      console.warn(`skip (missing title/category): ${file}`);
      continue;
    }
    rows.push({
      title: fm.title,
      category: fm.category,
      tags: Array.isArray(fm.tags) ? fm.tags : fm.tags ? [fm.tags] : [],
      keywords: fm.keywords || null,
      summary: fm.summary || null,
      vault_path: relative(VAULT, file).replaceAll('\\', '/'),
      metadata: {},
    });
  }

  console.log(`Found ${rows.length} document(s) under ${VAULT}`);
  if (DRY) { console.log(JSON.stringify(rows, null, 2)); return; }

  const { error } = await sb.from('documents').upsert(rows, { onConflict: 'vault_path' });
  if (error) { console.error(error); process.exit(1); }
  console.log(`Upserted ${rows.length} row(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
