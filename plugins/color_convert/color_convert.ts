import type { ToolPlugin, ToolContext, ToolResult } from '../types';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * "#RRGGBB" または "#RGB"(短縮形)を RGB 値に変換する。
 * 先頭の "#" は省略可。不正な形式なら Error を投げる。
 */
export function hexToRgb(hex: string): RgbColor {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$/.test(raw) && !/^[0-9a-fA-F]{6}$/.test(raw)) {
    throw new Error(
      `不正な16進カラーコード: "${hex}"(#RRGGBB または #RGB 形式で指定してください)`
    );
  }
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return { r, g, b };
}

/**
 * RGB 値(各 0〜255 の整数)を "#rrggbb" 形式に変換する。
 * 範囲外・非整数なら Error を投げる。
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const parts = [
    ['r', r],
    ['g', g],
    ['b', b],
  ] as const;
  for (const [label, v] of parts) {
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`${label} は 0〜255 の整数で指定してください(受領値: ${v})`);
    }
  }
  const toHex2 = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const plugin = {
  name: 'color_convert',
  description:
    '16進カラーコード(#RRGGBB / #RGB)とRGB値(0〜255)を相互変換する。{hex:"#1e90ff"} を渡すと r,g,b を、{r,g,b} を渡すと hex を返す。',
  inputSchema: {
    type: 'object',
    properties: {
      hex: {
        type: 'string',
        description: '16進カラーコード(例: "#1e90ff"、"#fff"、先頭の # は省略可)。RGB値へ変換する',
      },
      r: { type: 'integer', description: '赤成分 0〜255(g, b と共に指定して hex へ変換する)' },
      g: { type: 'integer', description: '緑成分 0〜255' },
      b: { type: 'integer', description: '青成分 0〜255' },
    },
  },
  risk: 'safe',
  tags: ['color', 'convert', 'utility'],
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      if (!isRecord(input)) {
        return { content: '入力はオブジェクトで指定してください(例: {"hex":"#1e90ff"} または {"r":30,"g":144,"b":255})', isError: true };
      }

      const hasHex = input['hex'] !== undefined;
      const hasRgb = input['r'] !== undefined || input['g'] !== undefined || input['b'] !== undefined;

      if (hasHex && hasRgb) {
        return { content: 'hex と r/g/b は同時に指定できません。どちらか一方を指定してください', isError: true };
      }

      if (hasHex) {
        const hex = input['hex'];
        if (typeof hex !== 'string') {
          return { content: 'hex は文字列で指定してください(例: "#1e90ff")', isError: true };
        }
        const rgb = hexToRgb(hex);
        return {
          content: JSON.stringify({ hex: rgbToHex(rgb.r, rgb.g, rgb.b), r: rgb.r, g: rgb.g, b: rgb.b }),
        };
      }

      if (hasRgb) {
        const r = input['r'];
        const g = input['g'];
        const b = input['b'];
        if (typeof r !== 'number' || typeof g !== 'number' || typeof b !== 'number') {
          return { content: 'r, g, b の3つすべてを数値で指定してください(例: {"r":30,"g":144,"b":255})', isError: true };
        }
        const hex = rgbToHex(r, g, b);
        return { content: JSON.stringify({ hex, r, g, b }) };
      }

      return {
        content: 'hex(16進→RGB)か、r/g/b(RGB→16進)のどちらかを指定してください',
        isError: true,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: `変換エラー: ${msg}`, isError: true };
    }
  },
} satisfies ToolPlugin;

export default plugin;
