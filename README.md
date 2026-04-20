# Claudeagent01 — Slack Knowledge Base Plugin

Slackから自分のナレッジベース（Obsidianヴォルト＋Supabase目次）にアクセスできる、Claude Code用プラグイン。VPS常駐のSocket Mode Botが、Slackメッセージを `claude -p` に橋渡しします。

> **Solo use only**. Claude CodeはMaxプランのOAuth認証で起動します。Botを第三者に開放する場合は、Anthropic APIに切り替えるか Teams/Enterprise プランを契約してください。

## 構成

```
Slack  ──Socket Mode──▶  slack-bot.js (VPS/systemd)
                                │  spawn
                                ▼
                         claude -p (Max OAuth)
                                │  MCP
           ┌───────────┬────────┴────────┬───────────┐
        Slack MCP   Supabase MCP     GitHub MCP    Filesystem MCP
                                                   (= knowledge/ vault)
```

## ディレクトリ

| パス | 用途 |
|---|---|
| `.claude-plugin/plugin.json` | プラグインメタデータ |
| `commands/` | スラッシュコマンド（`/slack-bot-start`, `/kb-search` など） |
| `skills/` | 振る舞いガイド（Slack書式、ナレッジ作法） |
| `agents/slack-responder.md` | Slack応答専用エージェント |
| `mcp/mcp.json` | Slack/Supabase/GitHub/Filesystem MCPの設定 |
| `scripts/slack-bot.js` | Socket Mode Bot本体（Node.js） |
| `scripts/install.sh` | VPS初期セットアップ（Ubuntu 24.04） |
| `scripts/sync-supabase.js` | ヴォルトとSupabase目次の同期 |
| `supabase/schema.sql` | `documents`テーブル＋検索RPC |
| `systemd/claude-slack-bot.service` | systemdユニット |
| `templates/note.md` | 汎用ノート雛形（frontmatterのみ規定） |
| `knowledge/` | 利用者のヴォルト本体（分類は自由） |
| `.env.example` | 必要な環境変数 |

---

## セットアップ

### 1. Slack Appの作成（初回のみ）

1. https://api.slack.com/apps → **Create New App** → *From scratch*
2. アプリ名（例: `Claudeagent01`）、ワークスペースを選択
3. **Socket Mode** → *Enable Socket Mode* を ON
   - 生成される *App-Level Token* (`xapp-...`) をコピー → `.env` の `SLACK_APP_TOKEN`
   - スコープ `connections:write` を付与
4. **OAuth & Permissions** → *Bot Token Scopes* に以下を追加:
   - `app_mentions:read`
   - `channels:history`
   - `channels:read`
   - `chat:write`
   - `commands`
   - `groups:history`
   - `groups:read`
   - `im:history`
   - `im:read`
   - `im:write`
   - `reactions:read`
   - `reactions:write`
   - `users:read`
5. **Install to Workspace** → 許可すると *Bot User OAuth Token* (`xoxb-...`) が発行 → `.env` の `SLACK_BOT_TOKEN`
6. **Basic Information** → *Signing Secret* をコピー → `.env` の `SLACK_SIGNING_SECRET`
7. **Event Subscriptions** → *Enable Events* ON → *Subscribe to bot events* に `app_mention` を追加
8. **Slash Commands** で3つ登録（Request URL欄は Socket Mode では空でOK）:
   - `/claude-status` — Show active sessions
   - `/claude-stop`   — Stop current thread session
   - `/claude-reset`  — Clear all sessions
9. Botを使いたいチャンネルに `/invite @Claudeagent01` で招待

### 2. Supabaseプロジェクトの作成

1. https://supabase.com/dashboard → **New project**
2. プロジェクト作成後、**SQL Editor** で `supabase/schema.sql` を貼り付けて実行
3. **Settings → API**:
   - `Project URL` → `.env` の `SUPABASE_URL`
   - `service_role` key → `.env` の `SUPABASE_SERVICE_ROLE_KEY`
4. （MCP用）**Settings → Access Tokens** で personal access token を発行 → `.env` の `SUPABASE_ACCESS_TOKEN`

### 3. GitHubリポジトリ

```bash
# ローカル（Windows）で
cd "C:/Users/imaizumi.LINEWORKS-NET/Documents/機械設計用／Claudeagent01"
git init
git branch -M main
git remote add origin https://github.com/skyblueearthjapan/Claudeagent01.git
git add .
git commit -m "initial: slack knowledge base plugin scaffold"
git push -u origin main
```

GitHub MCP用のPATは https://github.com/settings/tokens で作成（scope: `repo`）→ `.env` の `GITHUB_TOKEN`

### 4. VPSセットアップ（Ubuntu 24.04 / Hostinger）

```bash
# ローカルPCから
ssh root@31.97.109.137

# VPS上で
cd /opt
git clone https://github.com/skyblueearthjapan/Claudeagent01.git claudeagent01
cd claudeagent01
bash scripts/install.sh
```

インストール完了後、指示に従って:

```bash
# 1) Claude CodeにMaxアカウントでOAuthログイン
sudo -u claudeagent -H claude login
# → ブラウザURLが表示されるので、ローカルブラウザで開いて認証コードを貼り付け

# 2) .env を編集
nano /opt/claudeagent01/.env
# SLACK_*, SUPABASE_*, GITHUB_TOKEN を実値に

# 3) 起動
systemctl start claude-slack-bot
systemctl status claude-slack-bot
journalctl -u claude-slack-bot -f
```

### 5. Obsidianヴォルトの接続（ローカルPC）

Obsidianで `knowledge/` フォルダを編集し、自動的にGitHub経由でVPSと同期させます。

1. **Obsidianをインストール**: https://obsidian.md/download
2. 起動後、*Open folder as vault* を選択
3. このリポジトリのローカルクローン内の `knowledge/` フォルダを指定:
   `C:\Users\imaizumi.LINEWORKS-NET\Documents\機械設計用／Claudeagent01\knowledge`
4. **Community plugins を有効化**:
   - Settings → *Community plugins* → *Turn on community plugins*
5. **Obsidian Git プラグインをインストール**（by Vinzent）:
   - *Browse* → `Obsidian Git` を検索 → Install → Enable
6. **Obsidian Git 設定**:
   - *Vault backup interval (minutes)*: `5`（5分毎に自動commit）
   - *Auto pull interval (minutes)*: `5`（起動時+定期pull）
   - *Pull updates on startup*: ON
   - *Push on backup*: ON
   - *Commit message*: `vault: {{date}} {{numFiles}} files`
7. **テンプレート設定**（任意、推奨）:
   - Settings → *Core plugins* → *Templates* を ON
   - *Template folder location* に `../templates` を指定（リポジトリの `templates/` を参照）
8. **テスト**: 新規ノートを作成 → 5分以内に自動pushされ、GitHubに反映されることを確認

### 6. VPS側の自動pull（Obsidianからの変更を反映）

Obsidianから `git push` されたあと、VPS側も自動で `git pull` + Supabase同期するようcronを設定:

```bash
ssh root@31.97.109.137
crontab -u claudeagent -e
```

以下を追記（5分毎に同期）:
```
*/5 * * * * cd /opt/claudeagent01 && git pull --quiet && cd scripts && node sync-supabase.js >> /var/log/claudeagent01/sync.log 2>&1
```

### 7. 動作確認

Slackで:
- Botを招待したチャンネルで `@Claudeagent01 こんにちは` → 返信が来ればOK
- `/claude-status` → Active sessions: 0 が表示される

Obsidianで:
- ノートを編集 → 5分後にGitHubに反映 → さらに5分後にVPS `knowledge/` + Supabase `documents` に反映

---

## ナレッジの追加

1. Obsidianで `knowledge/` 配下に `.md` を作成（frontmatter必須、`templates/note.md` 参照）
2. `git push`
3. SlackでBotに「`/kb-sync` を実行して」と依頼、または手動で:
   ```bash
   ssh root@31.97.109.137 'sudo -u claudeagent bash -lc "cd /opt/claudeagent01 && git pull && cd scripts && node sync-supabase.js"'
   ```

---

## 更新デプロイ

```bash
ssh root@31.97.109.137 '
  cd /opt/claudeagent01 && git pull &&
  cd scripts && sudo -u claudeagent npm install --omit=dev &&
  systemctl restart claude-slack-bot
'
```

---

## トラブルシューティング

| 症状 | 確認 |
|---|---|
| Botが反応しない | `systemctl status claude-slack-bot` / `journalctl -u claude-slack-bot -f` |
| `claude: command not found` | `which claude` → なければ `npm i -g @anthropic-ai/claude-code` |
| OAuth期限切れ | `sudo -u claudeagent -H claude login` で再認証 |
| Supabase検索が空 | `node scripts/sync-supabase.js --dry` で対象ファイルを確認、frontmatterの `title`/`category` があるか |
| Slackで `not_in_channel` | Botをチャンネルに `/invite` |

---

## ライセンス

MIT
