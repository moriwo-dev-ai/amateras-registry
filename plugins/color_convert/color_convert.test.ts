import { describe, it, expect } from 'vitest';
import plugin, { hexToRgb, rgbToHex } from './color_convert';
import type { ToolContext } from '../types';

const ctx = {} as ToolContext;

describe('hexToRgb', () => {
  it('#RRGGBB を RGB に変換する', () => {
    expect(hexToRgb('#1e90ff')).toEqual({ r: 30, g: 144, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('# 省略・短縮形 #RGB にも対応する', () => {
    expect(hexToRgb('1e90ff')).toEqual({ r: 30, g: 144, b: 255 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#08c')).toEqual({ r: 0, g: 136, b: 204 });
  });

  it('不正な形式は Error を投げる', () => {
    expect(() => hexToRgb('#12345')).toThrow();
    expect(() => hexToRgb('#gggggg')).toThrow();
    expect(() => hexToRgb('')).toThrow();
  });
});

describe('rgbToHex', () => {
  it('RGB を #rrggbb に変換する', () => {
    expect(rgbToHex(30, 144, 255)).toBe('#1e90ff');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbToHex(1, 2, 3)).toBe('#010203');
  });

  it('範囲外・非整数は Error を投げる', () => {
    expect(() => rgbToHex(-1, 0, 0)).toThrow();
    expect(() => rgbToHex(0, 256, 0)).toThrow();
    expect(() => rgbToHex(0, 0, 1.5)).toThrow();
  });
});

describe('plugin.execute', () => {
  it('hex 入力で r,g,b を返す', async () => {
    const r = await plugin.execute({ hex: '#1e90ff' }, ctx);
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content) as { r: number; g: number; b: number; hex: string };
    expect(parsed).toEqual({ hex: '#1e90ff', r: 30, g: 144, b: 255 });
  });

  it('r,g,b 入力で hex を返す', async () => {
    const r = await plugin.execute({ r: 30, g: 144, b: 255 }, ctx);
    expect(r.isError).toBeFalsy();
    const parsed = JSON.parse(r.content) as { hex: string };
    expect(parsed.hex).toBe('#1e90ff');
  });

  it('hex と rgb の同時指定はエラー', async () => {
    const r = await plugin.execute({ hex: '#fff', r: 1, g: 2, b: 3 }, ctx);
    expect(r.isError).toBe(true);
  });

  it('どちらも無い・不正入力はエラー', async () => {
    const r1 = await plugin.execute({}, ctx);
    expect(r1.isError).toBe(true);
    const r2 = await plugin.execute('not-an-object', ctx);
    expect(r2.isError).toBe(true);
    const r3 = await plugin.execute({ hex: '#zzzzzz' }, ctx);
    expect(r3.isError).toBe(true);
    const r4 = await plugin.execute({ r: 30, g: 144 }, ctx);
    expect(r4.isError).toBe(true);
  });
});
