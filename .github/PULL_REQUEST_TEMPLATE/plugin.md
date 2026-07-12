---
name: プラグインの投稿
about: ツールプラグインを1件追加する(1 PR = 1 プラグイン)
---

## 何をするツールか

<!-- 1〜2文。誇張しない。索引の description と同じ趣旨で。 -->

## チェックリスト

- [ ] `plugins/<name>/` に `<name>.ts` / `<name>.test.ts` / `manifest.json` の3点が揃っている
- [ ] `manifest.name` = ディレクトリ名 = ファイル名
- [ ] **外部npm依存ゼロ**(`dependencies` は空配列。import は Node 組み込みと `../types` のみ)
- [ ] `permissions` がコードの実態と一致している(宣言外の network / child_process / fs はCIで落ちます)
- [ ] `license` はAGPL互換のSPDX ID
- [ ] `index.json` に `"verified": false` でエントリを追記した(検証済みへの昇格はレビュー後)
- [ ] `smoke.input` に実行1回分の入力例がある
- [ ] `git commit -s`(DCO 署名)

## 危険権限を使う場合

<!-- network / childProcess を true にしているなら、何のために必要かをここに書いてください。
     レビューが特に慎重になります。 -->
