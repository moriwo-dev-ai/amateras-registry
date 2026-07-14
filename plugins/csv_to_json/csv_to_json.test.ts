import { describe, expect, it } from 'vitest';
import plugin from './csv_to_json';

const run = async (input: unknown): Promise<string> => {
  const r = await plugin.execute(input, {} as never);
  return r.content;
};

describe('csv_to_json', () => {
  it('1行目をヘッダにしてオブジェクトの配列にする', async () => {
    const out = JSON.parse(await run({ csv: 'name,age\n田中,20\n鈴木,31' }));
    expect(out).toEqual([
      { name: '田中', age: '20' },
      { name: '鈴木', age: '31' },
    ]);
  });

  it('引用符の中のカンマと二重引用符を壊さない', async () => {
    const out = JSON.parse(await run({ csv: 'a,b\n"1,2","彼は""はい""と言った"' }));
    expect(out).toEqual([{ a: '1,2', b: '彼は"はい"と言った' }]);
  });

  it('空入力はエラーにする(黙って空配列を返さない)', async () => {
    const r = await plugin.execute({ csv: '' }, {} as never);
    expect(r.isError).toBe(true);
  });
});
