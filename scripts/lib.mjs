// validate.mjs の純粋部分(依存ゼロ)。
// validate.mjs は読み込むだけで検証を走らせて exit するため、テストしたい関数はここに置く。

/**
 * import/require の指定子を拾う。
 *
 * 直前の1文字を必ず見ること。以前は `from\s*['"]` と前を見ていなかったため、コード中の
 * ただの文字列 `'from'`(ストップワード表など)の**閉じ**クォートを import の書き出しと
 * 読み違え、次のクォートまでを指定子として拾っていた。
 * 実例: uzume-patrol の `'from',\n  'by'` が `",\n  "` という import として弾かれた。
 *
 * 誤検知は「落ちるから気づく」だけでは済まない。この関数は権限抽出にも使われるので、
 * 配列の中の 'https' や 'fs' といったただの文字列を import と誤読すると
 * **権限を過大に付ける**方向にも壊れる。
 */
export function moduleSpecifiers(code) {
  const out = [];
  // 直前が識別子文字・クォート・ドット(Buffer.from 等)ならキーワードではない
  const BOUNDARY = `(?:^|[^\\w'"\`$.])`;
  const RE = new RegExp(`${BOUNDARY}(?:from\\s*|import\\s*\\(?\\s*|require\\s*\\(\\s*)['"]([^'"]+)['"]`, 'g');
  for (const m of code.matchAll(RE)) out.push(m[1]);
  for (const m of code.matchAll(new RegExp(`${BOUNDARY}import\\s+['"]([^'"]+)['"]`, 'g'))) out.push(m[1]);
  // 2本の正規表現は `import 'os'` で両方当たる。同じ指定子でエラーを二重に出さない
  return [...new Set(out.map((s) => (s.startsWith('node:') ? s.slice(5) : s)))];
}
