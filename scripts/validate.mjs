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

// ---- 2b. 神定義(gods/)の検証 ----
// ルールは本体 src/main/operations/gods.ts の validateGodDefinition と同一に保つこと。
// 神は「コード」ではなく定義データなので、検証もJSONスキーマの一致で足りる。
// エンジンは本体が実装している5種のみ(新エンジンは本体のコード変更であり、レジストリでは配れない)
const GOD_ID_RE = /^[a-z0-9-]{2,40}$/;
const GOD_ENGINES = new Set([
  'metrics-observer',
  'community-patrol',
  'draft-writer',
  'issue-gatekeeper',
  'kamuhakari',
]);
const HHMM_RE = /^\d{2}:\d{2}$/;

function validateGodDefinition(where, def) {
  if (typeof def !== 'object' || def === null) {
    errors.push(`${where}: 定義がオブジェクトではない`);
    return null;
  }
  if (typeof def.id !== 'string' || !GOD_ID_RE.test(def.id)) errors.push(`${where}: id は英小文字・数字・ハイフン(2〜40字)`);
  if (typeof def.name !== 'string' || def.name.trim() === '') errors.push(`${where}: name が空`);
  if (!GOD_ENGINES.has(def.engine)) {
    errors.push(`${where}: engine は ${[...GOD_ENGINES].join('/')} のいずれか(実際: ${def.engine})`);
  }
  const clock = def.clock;
  if (typeof clock !== 'object' || clock === null || (clock.intervalMin === undefined && clock.dailyTimes === undefined)) {
    errors.push(`${where}: clock に intervalMin か dailyTimes が必要`);
  } else {
    if (clock.intervalMin !== undefined && (typeof clock.intervalMin !== 'number' || !(clock.intervalMin > 0))) {
      errors.push(`${where}: clock.intervalMin は正の数値`);
    }
    if (clock.dailyTimes !== undefined && (!Array.isArray(clock.dailyTimes) || clock.dailyTimes.some((t) => typeof t !== 'string' || !HHMM_RE.test(t)))) {
      errors.push(`${where}: clock.dailyTimes は "HH:MM" の配列`);
    }
  }
  if (typeof def.dailyTokenBudget !== 'number' || !(def.dailyTokenBudget >= 0)) errors.push(`${where}: dailyTokenBudget は0以上の数値`);
  if (def.judgePrompt !== undefined && typeof def.judgePrompt !== 'string') errors.push(`${where}: judgePrompt は文字列`);
  if (def.judgePrompt !== undefined && def.engine !== 'community-patrol') {
    warnings.push(`${where}: judgePrompt は community-patrol でしか使われない(他エンジンでは無視される)`);
  }
  // 迎え入れた人の環境で勝手に走り出さないよう、配布する定義は停止状態で始める
  if (def.enabled !== false) errors.push(`${where}: 配布する定義は "enabled": false であること(迎えた人が自分で有効化する)`);
  // 未知のキーは受け入れない(本体は捨てるが、索引に意味ありげな余分を載せさせない)
  const ALLOWED = new Set(['id', 'name', 'engine', 'clock', 'judgePrompt', 'dailyTokenBudget', 'enabled']);
  for (const key of Object.keys(def)) {
    if (!ALLOWED.has(key)) errors.push(`${where}: 未知のキー "${key}"(定義は ${[...ALLOWED].join('/')} のみ)`);
  }
  // 定義データに秘密を持たせない(神は資格情報を持たない。認証は本体のsecretsが担う)。
  // 判定は**値**だけを見る(キー名の dailyTokenBudget を誤検出しないため)
  const values = [def.id, def.name, def.judgePrompt].filter((v) => typeof v === 'string');
  if (values.some((v) => /(api[_-]?key|password|secret|bearer\s|sk-[a-z0-9]{8,})/i.test(v))) {
    errors.push(`${where}: 定義に資格情報らしき文字列がある(神の定義に秘密を含めてはならない)`);
  }
  return def;
}

const godsDir = join(ROOT, 'gods');
const godDirs = existsSync(godsDir)
  ? readdirSync(godsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  : [];
const godDefs = new Map();
for (const dir of godDirs) {
  const defPath = join(godsDir, dir, `${dir}.json`);
  if (!existsSync(defPath)) {
    errors.push(`gods/${dir}: ${dir}.json が無い(ディレクトリ名=id=ファイル名)`);
    continue;
  }
  let def;
  try {
    def = JSON.parse(readFileSync(defPath, 'utf8'));
  } catch (e) {
    errors.push(`gods/${dir}: ${dir}.json がJSONとして不正: ${e.message}`);
    continue;
  }
  const validated = validateGodDefinition(`gods/${dir}`, def);
  if (validated && validated.id !== dir) errors.push(`gods/${dir}: ディレクトリ名と id(${validated.id})が不一致`);
  godDefs.set(dir, def);
}

if (index) {
  // gods[] が無い索引も許容(旧レジストリとの後方互換。本体は空配列として扱う)
  const gods = index.gods ?? [];
  if (!Array.isArray(gods)) {
    errors.push('index.json の gods は配列であること');
  } else {
    const indexed = new Set();
    for (const e of gods) {
      if (typeof e.id !== 'string' || !GOD_ID_RE.test(e.id)) { errors.push(`index/gods: id 不正: ${JSON.stringify(e.id)}`); continue; }
      indexed.add(e.id);
      if (!godDirs.includes(e.id)) { errors.push(`index/gods: gods/${e.id}/ が存在しない`); continue; }
      if (e.path !== `gods/${e.id}`) errors.push(`index/gods/${e.id}: path は "gods/${e.id}" であること`);
      if (e.file !== `${e.id}.json`) errors.push(`index/gods/${e.id}: file は "${e.id}.json" であること`);
      if (typeof e.description !== 'string' || e.description.trim() === '') errors.push(`index/gods/${e.id}: description が空(索引検索の対象)`);
      if (typeof e.version !== 'string' || !SEMVER_RE.test(e.version)) errors.push(`index/gods/${e.id}: version は semver であること`);
      if (typeof e.verified !== 'boolean') errors.push(`index/gods/${e.id}: verified は boolean であること`);
      const def = godDefs.get(e.id);
      // 索引と定義で engine/name が食い違うと「説明と違う神」を迎えることになる
      if (def && def.engine !== e.engine) errors.push(`index/gods/${e.id}: engine が定義と不一致(索引=${e.engine} / 定義=${def.engine})`);
      if (def && def.name !== e.name) errors.push(`index/gods/${e.id}: name が定義と不一致`);
    }
    for (const dir of godDirs) {
      if (!indexed.has(dir)) errors.push(`gods/${dir}/ が index.json に載っていない`);
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
console.log(`✓ 検証OK(プラグイン ${dirs.length}件・神 ${godDirs.length}件・警告 ${warnings.length}件)`);
