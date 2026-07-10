// レジストリCI検証(依存ゼロ・Node組み込みのみ)。
// ルールは AMA-teras 本体 src/main/registry/{manifest,permissions}.ts と同一に保つこと:
//  1. manifest.json のスキーマ検証(ツール名規則・semver・API範囲・AGPL互換ライセンス・依存ゼロ)
//  2. コードの静的解析による権限抽出と宣言の突き合わせ(宣言外API使用=エラー)
//  3. コード+テストの実在、index.json との整合、revoked.json のパース
// 使い方: node scripts/validate.mjs(リポジトリルートで実行。エラーがあれば exit 1)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1');
const errors = [];
const warnings = [];

// ---- ルール定義(本体と同期) ----
const SAFE_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const API_RANGE_RE = /^[\^~]?\d+(\.\d+){0,2}$/;
const AGPL_COMPATIBLE = new Set([
  'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later',
  'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later',
  'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'Unlicense', 'CC0-1.0',
]);
const NETWORK_MODULES = new Set(['http', 'https', 'net', 'tls', 'dns', 'dgram', 'http2', 'undici', 'ws']);
const FS_MODULES = new Set(['fs', 'fs/promises']);

function moduleSpecifiers(code) {
  const out = [];
  for (const m of code.matchAll(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/import\s+['"]([^'"]+)['"]/g)) out.push(m[1]);
  return out.map((s) => (s.startsWith('node:') ? s.slice(5) : s));
}

function extractPermissions(code) {
  const mods = moduleSpecifiers(code);
  const childProcess = mods.includes('child_process');
  let network = mods.some((m) => NETWORK_MODULES.has(m));
  if (!network) {
    network =
      /(?<![.\w])fetch\s*\(/.test(code) ||
      /new\s+WebSocket\s*\(/.test(code) ||
      /new\s+XMLHttpRequest\s*\(/.test(code);
  }
  const usesFs = mods.some((m) => FS_MODULES.has(m));
  return { network, childProcess, fsScope: usesFs ? 'workspace' : 'none' };
}

/** 実行時importの許可リスト(Node組み込み+型契約)。それ以外=外部npm依存 */
function checkImports(name, code) {
  const BUILTIN = new Set([
    'assert', 'buffer', 'child_process', 'crypto', 'dns', 'dgram', 'events', 'fs', 'fs/promises',
    'http', 'http2', 'https', 'net', 'os', 'path', 'process', 'querystring', 'readline', 'stream',
    'string_decoder', 'timers', 'tls', 'url', 'util', 'zlib',
  ]);
  for (const spec of moduleSpecifiers(code)) {
    if (BUILTIN.has(spec)) continue;
    if (spec === '../types') continue; // ToolPlugin 契約(型のみ)
    errors.push(`${name}: 許可されない import "${spec}"(Node組み込みと ../types のみ可=外部npm依存ゼロルール)`);
  }
}

// ---- 1. プラグインディレクトリの検証 ----
const pluginsDir = join(ROOT, 'plugins');
const dirs = existsSync(pluginsDir)
  ? readdirSync(pluginsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];

const manifests = new Map();
for (const dir of dirs) {
  const base = join(pluginsDir, dir);
  const manifestPath = join(base, 'manifest.json');
  if (!existsSync(manifestPath)) {
    errors.push(`${dir}: manifest.json が無い`);
    continue;
  }
  let m;
  try {
    m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    errors.push(`${dir}: manifest.json がJSONとして不正: ${e.message}`);
    continue;
  }
  if (typeof m.name !== 'string' || !SAFE_TOOL_NAME.test(m.name)) errors.push(`${dir}: name が不正`);
  if (m.name !== dir) errors.push(`${dir}: ディレクトリ名と manifest.name(${m.name})が不一致`);
  if (typeof m.version !== 'string' || !SEMVER_RE.test(m.version)) errors.push(`${dir}: version は semver であること`);
  if (typeof m.pluginApiVersion !== 'string' || !API_RANGE_RE.test(m.pluginApiVersion)) {
    errors.push(`${dir}: pluginApiVersion は "^1" のような範囲であること`);
  }
  if (typeof m.description !== 'string' || m.description.trim() === '') errors.push(`${dir}: description が空`);
  if (typeof m.license !== 'string' || !AGPL_COMPATIBLE.has(m.license)) {
    errors.push(`${dir}: license はAGPL互換のSPDX IDであること(実際: ${m.license})`);
  }
  if (!Array.isArray(m.dependencies) || m.dependencies.length !== 0) {
    errors.push(`${dir}: dependencies は空配列のみ(外部npm依存ゼロルール)`);
  }
  const p = m.permissions;
  const permsOk =
    p && typeof p.network === 'boolean' && typeof p.childProcess === 'boolean' &&
    (p.fsScope === 'none' || p.fsScope === 'workspace');
  if (!permsOk) {
    errors.push(`${dir}: permissions の形が不正`);
    continue;
  }

  const codePath = join(base, `${dir}.ts`);
  const testPath = join(base, `${dir}.test.ts`);
  if (!existsSync(codePath)) {
    errors.push(`${dir}: 本体 ${dir}.ts が無い`);
    continue;
  }
  if (!existsSync(testPath)) errors.push(`${dir}: テスト ${dir}.test.ts が無い(レジストリはテスト必須)`);

  const code = readFileSync(codePath, 'utf8');
  checkImports(dir, code);
  const actual = extractPermissions(code);
  if (actual.network && !p.network) errors.push(`${dir}: 宣言外のネットワークAPI使用を検出(permissions.network を true に)`);
  if (actual.childProcess && !p.childProcess) errors.push(`${dir}: 宣言外の child_process 使用を検出`);
  if (actual.fsScope === 'workspace' && p.fsScope === 'none') errors.push(`${dir}: 宣言外のファイルAPI使用を検出(fsScope を "workspace" に)`);
  if (!actual.network && p.network) warnings.push(`${dir}: network が過剰宣言(コードから検出されず)`);
  if (!actual.childProcess && p.childProcess) warnings.push(`${dir}: childProcess が過剰宣言`);
  if (actual.fsScope === 'none' && p.fsScope === 'workspace') warnings.push(`${dir}: fsScope が過剰宣言`);

  manifests.set(dir, m);
}

// ---- 2. index.json の整合 ----
let index;
try {
  index = JSON.parse(readFileSync(join(ROOT, 'index.json'), 'utf8'));
} catch (e) {
  errors.push(`index.json がJSONとして不正: ${e.message}`);
}
if (index) {
  if (index.registryVersion !== 1 || !Array.isArray(index.plugins)) {
    errors.push('index.json は { registryVersion: 1, plugins: [...] } であること');
  } else {
    const indexed = new Set();
    for (const e of index.plugins) {
      if (typeof e.name !== 'string' || !SAFE_TOOL_NAME.test(e.name)) { errors.push(`index: name 不正: ${JSON.stringify(e.name)}`); continue; }
      indexed.add(e.name);
      if (!dirs.includes(e.name)) { errors.push(`index: plugins/${e.name}/ が存在しない`); continue; }
      if (e.path !== `plugins/${e.name}`) errors.push(`index/${e.name}: path は "plugins/${e.name}" であること`);
      if (typeof e.verified !== 'boolean') errors.push(`index/${e.name}: verified は boolean であること`);
      const m = manifests.get(e.name);
      if (m && e.version !== m.version) errors.push(`index/${e.name}: version が manifest と不一致`);
      if (!Array.isArray(e.files) || e.files.some((f) => typeof f !== 'string' || /[\\/]|\.\./.test(f))) {
        errors.push(`index/${e.name}: files は単純ファイル名の配列であること`);
      } else {
        for (const f of e.files) {
          if (!existsSync(join(pluginsDir, e.name, f))) errors.push(`index/${e.name}: files の ${f} が実在しない`);
        }
      }
    }
    for (const dir of dirs) {
      if (!indexed.has(dir)) errors.push(`plugins/${dir}/ が index.json に載っていない`);
    }
  }
}

// ---- 3. revoked.json ----
try {
  const revoked = JSON.parse(readFileSync(join(ROOT, 'revoked.json'), 'utf8'));
  if (!Array.isArray(revoked?.revoked)) errors.push('revoked.json は { revoked: [...] } であること');
} catch (e) {
  errors.push(`revoked.json がJSONとして不正: ${e.message}`);
}

// ---- 結果 ----
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n検証失敗: ${errors.length}件のエラー`);
  process.exit(1);
}
console.log(`✓ 検証OK(プラグイン ${dirs.length}件・警告 ${warnings.length}件)`);
