# Status: utest/

Atualizado: 2026-06-19

`utest/` permanece como base de especificacao e compatibilidade para o sistema
de testes, mas nao deve ser tratado como arquitetura final isolada. O destino
operacional agora e `cmds/testio/testio.js`, reproduzindo as ideias de `utest`
sobre `lib/adapters/io-engine.js`.

---

## Estado: REFERENCIA LEGADA / MANUTENCAO

O runner atual em `utest/utest.js` e funcional para varias suites, mas o estado
documentado e o estado implementado divergiram:

- a documentacao antiga prometia workers por arquivo e isolamento total;
- o caminho atual de `utest/utest.js` e in-process;
- `TEST-PROBLEMS-I-FOUND.md` registra correcoes recentes e limites ainda
  abertos, especialmente source maps, TUI/non-TTY, cache parcial e cache de
  modulo ESM;
- `cmds/testio/testio.js` e o runner operacional concluido para a frente T1.

---

## Decisoes Ativas

- Separar fases: `unit`, `tui` e `integration`.
- `integration` testa sistemas em tempo de execucao, nao apenas arquivos com
  maior custo.
- Executar testes com workers por arquivo, em paralelo, para isolamento real de
  modulo, global state, timers e crashes nativos.
- Manter cache baseado em tempo, mas a comparacao deve bater por segundo, nao
  por minuto.
- Falha ao importar modulo alvo, shim ou arquivo de teste jamais deve ser
  engolida em test time; deve virar erro diagnostico do suite.
- `cmds/testio/testio.js` deve usar a arquitetura de IO como trilha principal,
  com registro persistente/reprodutivel via `lib/adapters/io-engine.js`.

---

## Encerramento T1

A reconciliacao operacional entre `utest` e `testio` foi encerrada em
2026-06-19. O `utest` permanece como referencia de contrato, scanner/cache e
compatibilidade historica; novas evolucoes devem entrar por `cmds/testio/`.

Backlog nao bloqueante:

1. classificar a fase `integration` com `testio integration --force --workers=4`;
2. extrair o transform de `bun:test` para `cmds/testio/plugins/bun-test.js`;
3. completar tipos de evento (`transform:error`, `module:export-mismatch`);
4. versionar formalmente o schema JSON do report;
5. adicionar `--no-color`.

Baseline atual: `testio .` cache-hot renderiza o mesmo total principal do
`utest` (`1125` no cache atual). O scanner do `testio` foi comparado contra
`utest/scanner.js` e retorna os mesmos 82 arquivos da suite `unit`. Para
detalhe completo, `testio -v3` e tratado como live/force: ignora o cache e
renderiza logs e testes intermediarios capturados pelo worker.

---

## Ver Tambem

- `utest/TEST-SPEC.md` - contrato alvo.
- `utest/TEST-PROBLEMS-I-FOUND.md` - achados recentes da migracao.
- `cmds/testio/testio.js` - runner que deve absorver a arquitetura.
- `lib/adapters/io-engine.js` - primitiva IO para log/cache/resultados.
