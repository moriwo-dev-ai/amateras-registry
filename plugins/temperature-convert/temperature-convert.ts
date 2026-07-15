import type { ToolPlugin, ToolContext, ToolResult } from '../types';

export type TempUnit = 'C' | 'F' | 'K';

const ABSOLUTE_ZERO: Record<TempUnit, number> = {
  C: -273.15,
  F: -459.67,
  K: 0,
};

export function isTempUnit(v: unknown): v is TempUnit {
  return v === 'C' || v === 'F' || v === 'K';
}

/** 摂氏に一旦揃える */
export function toCelsius(value: number, from: TempUnit): number {
  switch (from) {
    case 'C':
      return value;
    case 'F':
      return ((value - 32) * 5) / 9;
    case 'K':
      return value - 273.15;
  }
}

/** 摂氏から目的単位へ */
export function fromCelsius(celsius: number, to: TempUnit): number {
  switch (to) {
    case 'C':
      return celsius;
    case 'F':
      return (celsius * 9) / 5 + 32;
    case 'K':
      return celsius + 273.15;
  }
}

/** 浮動小数点ノイズを除去(小数10桁で丸め) */
export function roundResult(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

/**
 * 温度を変換する。単位が不正・値が非有限・絶対零度未満なら Error を投げる。
 */
export function convertTemperature(value: number, from: TempUnit, to: TempUnit): number {
  if (!Number.isFinite(value)) {
    throw new Error('value must be a finite number');
  }
  if (value < ABSOLUTE_ZERO[from]) {
    throw new Error(
      `temperature below absolute zero: ${value}${from} (minimum is ${ABSOLUTE_ZERO[from]}${from})`,
    );
  }
  if (from === to) {
    return value;
  }
  return roundResult(fromCelsius(toCelsius(value, from), to));
}

interface ParsedInput {
  value: number;
  from: TempUnit;
  to: TempUnit;
}

export function parseInput(input: unknown): ParsedInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('input must be an object like {"value": 100, "from": "C", "to": "F"}');
  }
  const obj = input as Record<string, unknown>;
  const value = obj['value'];
  const from = obj['from'];
  const to = obj['to'];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('"value" must be a finite number');
  }
  if (!isTempUnit(from)) {
    throw new Error('"from" must be one of "C", "F", "K"');
  }
  if (!isTempUnit(to)) {
    throw new Error('"to" must be one of "C", "F", "K"');
  }
  return { value, from, to };
}

export default {
  name: 'temperature-convert',
  description:
    '摂氏(C)・華氏(F)・ケルビン(K)の温度を相互変換する。value(数値)、from、to("C"|"F"|"K")を受け取り、変換後の温度を返す。絶対零度未満はエラー。',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'number', description: '変換元の温度値' },
      from: { type: 'string', enum: ['C', 'F', 'K'], description: '変換元の単位' },
      to: { type: 'string', enum: ['C', 'F', 'K'], description: '変換先の単位' },
    },
    required: ['value', 'from', 'to'],
    additionalProperties: false,
  },
  risk: 'safe',
  tags: ['conversion', 'temperature', 'utility'],
  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    try {
      const { value, from, to } = parseInput(input);
      const result = convertTemperature(value, from, to);
      return { content: String(result) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: `Error: ${msg}`, isError: true };
    }
  },
} satisfies ToolPlugin;
