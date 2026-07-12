# コントリビューションガイド

## DCO(Developer Certificate of Origin)

PRの提出により、以下に同意したものとみなします:

- 投稿するコードは自分が作成したもの(または再配布可能なライセンスの下で入手したもの)である
- **AGPL互換ライセンス**(manifest.json の `license`)での提供に同意する
- 著作権は(存在する範囲で)投稿者に帰属し、クレジットは manifest の `author` で保持される

コミットには `Signed-off-by: 名前 <メール>` を付けてください(`git commit -s`)。

## マニフェスト必須項目

```jsonc
{
  "name": "tool_name",          // 英数字・_・-、1〜64文字。ファイル名と一致させる
  "version": "1.0.0",           // semver
  "pluginApiVersion": "^1",     // 本体プラグインAPIとの互換範囲
  "description": "…",           // 空でないこと(索引検索の対象になる)
  "author": "…",                // クレジット(空文字可)
  "license": "AGPL-3.0",        // AGPL互換のSPDX ID(MIT / Apache-2.0 等も可)
  "permissions": {              // ★宣言と実装の不一致はCIで自動リジェクト
    "network": false,           // fetch / http(s) / net / WebSocket 等を使うか
    "childProcess": false,      // child_process を使うか
    "fsScope": "none"           // ファイルAPIを使うなら "workspace"
  },
  "dependencies": [],           // ★外部npm依存ゼロルール(空配列のみ受理)
  "smoke": { "input": {} }      // スモークテスト(実行1回)用の入力例
}
```

## ルール

1. **外部npm依存ゼロ**: 実行時に import してよいのは Node.js 組み込みモジュールのみ
   (サプライチェーンリスクの遮断)。`dependencies` は空配列のみ受理されます
2. **権限宣言の一致**: コードの静的解析結果と `permissions` が一致しない
   (宣言していないネットワークアクセス等がある)PRは自動リジェクトされます。
   過剰宣言(宣言したが未使用)は警告のみ
3. **テスト必須**: `<name>.test.ts` を同梱してください(vitest)
4. **本体内部への依存禁止**: プラグインが import してよいのは `../types`(ToolPlugin契約)と
   Node組み込みのみ。`src/main` 内部への相対 import は本体側のロード時に動きません
5. **1 PR = 1 プラグイン**(レビューと失効管理の単位)

## 神(運営エージェント)の投稿

神は**コードではなく定義データ**です。1体 = `gods/<id>/<id>.json` の1ファイル。

```jsonc
{
  "id": "saruta-hiko",              // 英小文字・数字・ハイフン(2〜40字)。ディレクトリ名・ファイル名と一致
  "name": "SARUTA-hiko(猿田彦・道案内)",
  "engine": "community-patrol",     // 本体が実装している5エンジンのいずれか(下表)
  "clock": { "intervalMin": 120 },  // または { "dailyTimes": ["09:00", "21:00"] }
  "judgePrompt": "…",               // 任意。community-patrol の目利きプロンプト上書き
  "dailyTokenBudget": 20000,        // 0=無制限。迎える人がコストを見積もれる値にする
  "enabled": false                  // ★配布する定義は必ず false(迎えた人が有効化する)
}
```

### エンジン一覧(これ以外は増やせません)

| engine | 役割 | `judgePrompt` |
|---|---|---|
| `metrics-observer` | 数字の観測(LLMを使わない) | 使わない |
| `community-patrol` | 巡回して候補を見つける | **使う**(目利きの差し替え) |
| `draft-writer` | 発信ドラフトを書く | 使わない |
| `issue-gatekeeper` | Issue/PRのトリアージ | 使わない |
| `kamuhakari` | 戦略会議(神議) | 使わない |

**新しいエンジンが必要な提案はレジストリでは受け付けられません**(本体のコード変更のため)。
[本体リポジトリ](https://github.com/moriwo-dev-ai/ama-teras) へ Issue / PR をお願いします。

### 神のルール

1. **命名は日本神話(八百万の神)から**採る(ブランドの掟)。役割に対応する神を選ぶこと。
   例: 猿田彦=道案内 / 少名毘古那=医薬・修復 / 石凝姥命=鏡作り・リリース
2. **`"enabled": false` で配る**。迎えた人の環境で勝手に走り出さないため
3. **定義に秘密を入れない**(APIキー・トークン・パスワード)。認証は本体が管理します。
   CIが値をスキャンして自動リジェクトします
4. `judgePrompt` は他人の環境で動きます。**特定の個人・アカウントを狙う指示や、
   発信を促す指示を書かない**(発信は本体側で必ず人間の承認を通りますが、掟として明記します)
5. 索引(`index.json` の `gods[]`)と定義で `id` / `name` / `engine` が食い違うPRはCIで落ちます

## 検証済みバッジへの昇格

新規掲載は `"verified": false` で受け入れます。メンテナーが内容をレビューし、
問題がなければ `verified: true` に昇格します(高リスク権限=network/childProcess を
使うプラグインは特に慎重にレビューします)。

## 失効(キルスイッチ)

掲載後に危険・重大バグが判明したプラグインは `revoked.json` に登録されます。
本体アプリは起動時にこれをチェックし、導入済みでも自動で無効化します。
