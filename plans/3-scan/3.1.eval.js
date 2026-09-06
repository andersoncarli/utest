// Eval da feature 3.1 — walk por glob do TEST.yaml (exclude global/fase, include padrão).
// A prova de campo do sprint 012: `utest . -w` só vigia o domínio do TEST.yaml —
// `node_modules/**` e o que o `exclude` listar ficam de fora do watcher, não só
// filtrados no callback depois de o SO já os ter percorrido.
//
// Nível `real`: roda contra o ROOT do projeto. `write`/`sh` são relativos a ele,
// então a fixture vive numa subpasta (`.eval-tmp-3.1/`) que o script cria e apaga.
// O watch sobe com `nohup ... < /dev/null &` para o `sh` capturado não travar no
// pipe do processo em background. A linha "Watching …" é impressa ao fim de cada
// rodada da suíte — contá-la (após strip de ANSI) mede quantas rodadas houve.
export default (t) => {
  // Nível sandbox: a peça unitária — `excludeFilter(configPath)` lê o `exclude`
  // (global + fase) do TEST.yaml e devolve um `.excluded(rel)` que casa os globs.
  // É o predicado que o watch usa para podar diretórios; provado aqui contra o
  // `scanner.js` real, sem subir o watcher.
  t.sandbox("excludeFilter: o predicado de poda vem do exclude do TEST.yaml", async ({ sh, check, write }) => {
    const U = process.cwd(); // o ROOT do utest (a fase real roda daqui)
    write("TEST.yaml", 'exclude:\n  - "node_modules/**"\n  - "archive/**"\nunit:\n  exclude:\n    - "dist/**"\n');
    write("probe.js",
      `import { excludeFilter } from ${JSON.stringify(U + "/scanner.js")}\n` +
      `const f = excludeFilter("TEST.yaml", "unit")\n` +
      `const say = (rel) => console.log(rel + " " + f.excluded(rel))\n` +
      `say("node_modules"); say("node_modules/foo/x.js"); say("archive")\n` +
      `say("dist/bundle.js"); say("src/scanner.js")\n`);
    const r = await sh(`bun probe.js`);
    check(r.out.includes("node_modules true"), true, "diretório do glob global casa");
    check(r.out.includes("node_modules/foo/x.js true"), true, "arquivo fundo no glob global casa");
    check(r.out.includes("archive true"), true, "segundo glob global casa");
    check(r.out.includes("dist/bundle.js true"), true, "exclude da fase soma ao global");
    check(r.out.includes("src/scanner.js false"), true, "fonte fora do exclude não casa");
  });

  t.real("watch ignora node_modules e o exclude do TEST.yaml; mudança de fonte re-roda", async ({ sh, check, write }) => {
    const dir = ".eval-tmp-3.1";
    write(`${dir}/TEST.yaml`,
      'exclude:\n  - "node_modules/**"\n  - "archive/**"\nunit:\n  include:\n    - "**/*.t.js"\n');
    write(`${dir}/a.t.js`,
      "import test from '../test.js'\n" +
      "import { check } from '../check.js'\n" +
      "test('sample', () => check(1 + 1, 2))\n");
    write(`${dir}/node_modules/foo/x.js`, "// seed\n");
    write(`${dir}/archive/old.js`, "// seed\n");

    const runs = `sed 's/\\x1b\\[[0-9;]*m//g' w.log | grep -c '^Watching '`;
    const script = `
cd ${dir}
nohup bun ../utest.js . -w > w.log 2>&1 < /dev/null &
WPID=$!
sleep 3
printf '// churn\\n' >> node_modules/foo/x.js
printf '// churn\\n' >> archive/old.js
sleep 2
A=$(${runs})
printf '// real change\\n' >> a.t.js
sleep 4
B=$(${runs})
kill "$WPID" 2>/dev/null; pkill -P "$WPID" 2>/dev/null
printf 'RUNS_AFTER_CHURN=%s RUNS_AFTER_SRC=%s\\n' "$A" "$B"
cd ..
rm -rf ${dir}
`;
    const r = await sh(script);
    const out = r.out.replace(/\x1b\[[0-9;]*m/g, "");
    const m = out.match(/RUNS_AFTER_CHURN=(\d+) RUNS_AFTER_SRC=(\d+)/);
    check(!!m, true, "o script reportou as duas contagens");
    const afterChurn = Number(m[1]);
    const afterSrc = Number(m[2]);
    check(afterChurn, 1, "após churn em node_modules/ e archive/ (ambos no exclude): só a rodada inicial");
    check(afterSrc, 2, "após mudar a.t.js (fonte real, fora do exclude): uma rodada nova");
  });
};
