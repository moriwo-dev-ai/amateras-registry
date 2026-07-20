// 検証ロジック自身のテスト(依存ゼロ)。CI で validate.mjs の前に走らせる。
// 誤検知でPRを落とすと、投稿者には原因がまず分からない。ここで固定する。
import { moduleSpecifiers } from './lib.mjs';

let failed = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ✓ ${name}`); return; }
  console.log(`  ✗ ${name}\n     期待: ${w}\n     実際: ${g}`);
  failed++;
};

console.log('moduleSpecifiers:');

eq('通常の import', moduleSpecifiers(`import type { ToolPlugin } from '../types';`), ['../types']);
eq('node: 接頭辞は剥がす', moduleSpecifiers(`import { readFile } from 'node:fs/promises';`), ['fs/promises']);
eq('require', moduleSpecifiers(`const x = require('path');`), ['path']);
eq('動的 import', moduleSpecifiers(`await import('crypto');`), ['crypto']);
eq('副作用のみの import', moduleSpecifiers(`import 'os';`), ['os']);

// 回帰: 文字列としての 'from' を import と読み違えない(PR #5 uzume-patrol が落ちた原因)
eq(
  "ストップワード表の 'from'",
  moduleSpecifiers(`const STOP = [\n  'and',\n  'from',\n  'by',\n];`),
  [],
);
eq(
  "'import' や 'require' という文字列",
  moduleSpecifiers(`const WORDS = ['import', 'require', 'x'];`),
  [],
);
eq(
  '実ファイル相当(1行目に import、後段に from 文字列)',
  moduleSpecifiers(`import type { A } from '../types';\nconst S = [\n  'from',\n  'to',\n];`),
  ['../types'],
);

// Buffer.from などのメソッド名を拾わない(権限の過大判定を防ぐ)
eq('Buffer.from(text, "utf8")', moduleSpecifiers(`Buffer.from(text, 'utf8')`), []);

// 権限の過大判定にならないこと: ただの文字列 'https' を import 扱いしない
eq("文字列の 'https'", moduleSpecifiers(`const SCHEMES = ['https', 'fs'];`), []);

console.log(failed === 0 ? '\n自己テスト: 全件合格' : `\n自己テスト: ${failed}件失敗`);
process.exit(failed === 0 ? 0 : 1);
