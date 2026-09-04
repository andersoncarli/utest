// Eval da feature 4.6 — v2 continuo: rio de passados, bloco cheio so nos falhos.
export default (t) => {
  // fixture de 3 arquivos (2 verdes, 1 vermelho) — `bun utest.js <dir> -v:2 --force` deve
  // mostrar os verdes num rio continuo (`b.t.js ✔1  a.t.js ✔1`) e o vermelho sozinho no
  // bloco cheio: dotfill de titulo, `received`/`expected` e o caller line.
  t.real("verdes no rio continuo, vermelho no bloco cheio (received/expected/caller line)", async ({ sh, check, write }) => {
    write("/tmp/utest-4.6-fixture/a.t.js", "test('a', ({ check }) => { check(1, 1) })\n");
    write("/tmp/utest-4.6-fixture/b.t.js", "test('b', ({ check }) => { check(2, 2) })\n");
    write("/tmp/utest-4.6-fixture/c.t.js", "test('c', ({ check }) => { check(2 + 2, 5) })\n");
    const r = await sh("bun utest.js /tmp/utest-4.6-fixture -v:2 --force");
    const out = r.out.replace(/\x1b\[[0-9;]*m/g, "");
    check(out.includes("a.t.js ✔1") && out.includes("b.t.js ✔1"), true, "os dois verdes aparecem com nome+contagem");
    check(/a\.t\.js ✔1\s{2}b\.t\.js ✔1|b\.t\.js ✔1\s{2}a\.t\.js ✔1/.test(out), true, "os verdes ficam na MESMA linha, 2 espacos, sem dotfill entre eles");
    check(out.includes("received: 4"), true, "o falho mostra received");
    check(out.includes("expected: 5"), true, "o falho mostra expected");
    check(out.includes("c.t.js:001"), true, "o falho mostra o caller line");
    check(/c\.t\.js.*-{5,}/.test(out), true, "o falho ganha dotfill proprio (fileLine) — os verdes nao");
  });
};
