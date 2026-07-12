---
name: 神(運営エージェント)の投稿
about: 神の定義JSONを1体追加する(1 PR = 1体)
---

## どんな神か

<!-- 何を見て、何を出す神か。1〜2文。索引の description と同じ趣旨で。
     既存の神(OMOI-kami / AMENO-uzume / TEDIKA-rao / 神議)と何が違うのかを書いてください。 -->

## チェックリスト

- [ ] `gods/<id>/<id>.json` の1ファイル(ディレクトリ名 = `id` = ファイル名)
- [ ] **名は日本神話(八百万の神)から**採り、役割に対応している(ブランドの掟)
- [ ] `engine` は本体実装の5種のいずれか
      (`metrics-observer` / `community-patrol` / `draft-writer` / `issue-gatekeeper` / `kamuhakari`)
- [ ] **`"enabled": false`**(迎えた人の環境で勝手に走り出さない)
- [ ] `dailyTokenBudget` は迎える人がコストを見積もれる現実的な値
- [ ] **定義に秘密を入れていない**(APIキー・トークン・パスワード。CIが値をスキャンします)
- [ ] `judgePrompt` を書いた場合、**特定の個人・アカウントを狙う指示や発信を促す指示が無い**
- [ ] `index.json` の `gods[]` にエントリを追記した(`id` / `name` / `engine` は定義と一致)
- [ ] `git commit -s`(DCO 署名)

## 新しいエンジンが必要な提案ではないこと

このレジストリで配れるのは**既存エンジンの組み合わせとパラメータ**だけです。
どのエンジンにも当てはまらない振る舞いが必要なら、それは本体のコード変更です
→ [AMA-teras 本体](https://github.com/moriwo-dev-ai/ama-teras) へ Issue / PR をお願いします。
