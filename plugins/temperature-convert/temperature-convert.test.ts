import { describe, it, expect } from 'vitest';
import plugin, {
  convertTemperature,
  parseInput,
  toCelsius,
  fromCelsius,
  isTempUnit,
} from './temperature-convert';
import type { ToolContext } from '../types';

const ctx = {} as ToolContext;

describe('convertTemperature', () => {
  it('C -> F: 100C は 212F', () => {
    expect(convertTemperature(100, 'C', 'F')).toBe(212);
  });

  it('F -> K: 32F は 273.15K', () => {
    expect(convertTemperature(32, 'F', 'K')).toBe(273.15);
  });

  it('K -> C: 300K は 26.85C(浮動小数点ノイズなし)', () => {
    expect(convertTemperature(300, 'K', 'C')).toBe(26.85);
  });

  it('同一単位はそのまま返す', () => {
    expect(convertTemperature(25, 'C', 'C')).toBe(25);
    expect(convertTemperature(-40, 'F', 'F')).toBe(-40);
  });

  it('-40C と -40F は等しい', () => {
    expect(convertTemperature(-40, 'C', 'F')).toBe(-40);
    expect(convertTemperature(-40, 'F', 'C')).toBe(-40);
  });

  it('絶対零度未満はエラー', () => {
    expect(() => convertTemperature(-500, 'C', 'K')).toThrow(/absolute zero/);
    expect(() => convertTemperature(-0.01, 'K', 'C')).toThrow(/absolute zero/);
    expect(() => convertTemperature(-460, 'F', 'C')).toThrow(/absolute zero/);
  });

  it('絶対零度ちょうどは許容', () => {
    expect(convertTemperature(0, 'K', 'C')).toBe(-273.15);
    expect(convertTemperature(-273.15, 'C', 'K')).toBe(0);
  });
});

describe('toCelsius / fromCelsius / isTempUnit', () => {
  it('toCelsius が正しく変換する', () => {
    expect(toCelsius(212, 'F')).toBe(100);
    expect(toCelsius(273.15, 'K')).toBe(0);
    expect(toCelsius(5, 'C')).toBe(5);
  });

  it('fromCelsius が正しく変換する', () => {
    expect(fromCelsius(100, 'F')).toBe(212);
    expect(fromCelsius(0, 'K')).toBe(273.15);
  });

  it('isTempUnit は C/F/K のみ true', () => {
    expect(isTempUnit('C')).toBe(true);
    expect(isTempUnit('F')).toBe(true);
    expect(isTempUnit('K')).toBe(true);
    expect(isTempUnit('c')).toBe(false);
    expect(isTempUnit('X')).toBe(false);
    expect(isTempUnit(1)).toBe(false);
  });
});

describe('parseInput', () => {
  it('正しい入力をパースする', () => {
    expect(parseInput({ value: 100, from: 'C', to: 'F' })).toEqual({
      value: 100,
      from: 'C',
      to: 'F',
    });
  });

  it('不正な単位・値を拒否する', () => {
    expect(() => parseInput({ value: 1, from: 'X', to: 'C' })).toThrow(/"from"/);
    expect(() => parseInput({ value: 1, from: 'C', to: 'kelvin' })).toThrow(/"to"/);
    expect(() => parseInput({ value: 'hot', from: 'C', to: 'F' })).toThrow(/"value"/);
    expect(() => parseInput({ value: NaN, from: 'C', to: 'F' })).toThrow(/"value"/);
    expect(() => parseInput(null)).toThrow(/object/);
  });
});

describe('plugin.execute', () => {
  it('成功時は content に数値文字列を返す', async () => {
    const r = await plugin.execute({ value: 100, from: 'C', to: 'F' }, ctx);
    expect(r.isError).toBeUndefined();
    expect(r.content).toBe('212');
  });

  it('F -> K / K -> C / 同一単位', async () => {
    expect((await plugin.execute({ value: 32, from: 'F', to: 'K' }, ctx)).content).toBe('273.15');
    expect((await plugin.execute({ value: 300, from: 'K', to: 'C' }, ctx)).content).toBe('26.85');
    expect((await plugin.execute({ value: 25, from: 'C', to: 'C' }, ctx)).content).toBe('25');
  });

  it('絶対零度未満は isError', async () => {
    const r = await plugin.execute({ value: -500, from: 'C', to: 'K' }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/absolute zero/);
  });

  it('不正な単位は isError', async () => {
    const r = await plugin.execute({ value: 10, from: 'Z', to: 'C' }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/"from"/);
  });
});
