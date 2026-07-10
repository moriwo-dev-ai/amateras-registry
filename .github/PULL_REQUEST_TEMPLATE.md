## プラグイン投稿チェックリスト

- [ ] `plugins/<name>/` に **コード(`<name>.ts`)+テスト(`<name>.test.ts`)+`manifest.json`** の3点を配置した
- [ ] `index.json` にエントリを追記した(`"verified": false` のまま)
- [ ] `manifest.json` の **permissions がコードの実態と一致**している(network / childProcess / fsScope)
- [ ] 実行時 import は **Node.js 組み込みモジュールのみ**(外部npm依存ゼロ・`dependencies: []`)
- [ ] ライセンスは **AGPL互換のSPDX ID** を指定した
- [ ] **DCO**: コミットに `Signed-off-by` を付けた(`git commit -s`)— AGPL互換ライセンスでの提供に同意します
- [ ] `node scripts/validate.mjs` がローカルで成功する

## このプラグインは何をしますか?

(1〜3行で。どんな依頼のときに使われるツールか)

## 権限を使う場合はその理由

(network / childProcess / fsScope: workspace を宣言している場合、なぜ必要かを書いてください)
