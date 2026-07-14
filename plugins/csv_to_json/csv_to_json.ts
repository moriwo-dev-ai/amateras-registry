import type { ToolContext, ToolPlugin } from '../types';

/** CSVテキストをJSON配列にする(1行目をヘッダとして扱う)。引用符とエスケープ("")に対応 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export default {
  name: 'csv_to_json',
  description:
    'CSVテキストをJSONの配列に変換する。1行目をヘッダ(キー)として扱い、各行をオブジェクトにする。' +
    '引用符("")とカンマ・改行を含むセルに対応。ファイルは読まない(文字列を受け取り、文字列を返す)',
  inputSchema: {
    type: 'object',
    properties: {
      csv: { type: 'string', description: '変換するCSVテキスト' },
      header: { type: 'boolean', description: '1行目をヘッダとして扱う(既定 true)' },
    },
    required: ['csv'],
  },
  risk: 'safe',
  // ToolPlugin の契約は execute(input, ctx)。ctx を省くと、テストから2引数で呼べない
  async execute(input: unknown, _ctx: ToolContext) {
    const { csv, header } = input as { csv?: unknown; header?: unknown };
    if (typeof csv !== 'string' || csv.trim() === '') {
      return { content: 'csv は空でない文字列で指定すること', isError: true };
    }
    const rows = parseCsv(csv);
    if (rows.length === 0) return { content: '[]' };
    if (header === false) return { content: JSON.stringify(rows, null, 2) };
    const [head, ...body] = rows;
    const out = body.map((r) => Object.fromEntries((head ?? []).map((k, i) => [k, r[i] ?? ''])));
    return { content: JSON.stringify(out, null, 2) };
  },
} satisfies ToolPlugin;
