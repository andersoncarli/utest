# Status: utest/

Atualizado: 2026-06-18

`utest/` permanece como base de especificacao e compatibilidade para o sistema
de testes, mas nao deve ser tratado como arquitetura final isolada. O destino
operacional agora e `cmds/testio/testio.js`, reproduzindo as ideias de `utest`
sobre `lib/adapters/io-engine.js`.

---

## Estado: EM RECONCILIACAO

O runner atual em `utest/utest.js` e funcional para varias suites, mas o estado
documentado e o estado implementado divergiram:

- a documentacao antiga prometia workers por arquivo e isolamento total;
- o caminho atual de `utest/utest.js` e in-process;
- `TEST-PROBLEMS-I-FOUND.md` registra correcoes recentes e limites ainda
  abertos, especialmente source maps, TUI/non-TTY, cache parcial e cache de
  modulo ESM;
- `cmds/testio/testio.js` e o caminho para onde o sistema deve andar.

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

## Proxima Acao

Reconciliar a arquitetura de `testio` com a especificacao de `utest`:

1. revisar `cmds/testio/testio.js` e separar discovery, worker execution,
   result log/cache e render;
2. mover o contrato de cache para segundos e corrigir arredondamentos;
3. criar workers por arquivo antes de ampliar paralelismo;
4. mover suites TUI/non-TTY para a fase `tui`;
5. transformar falhas silenciosas de load/import em resultados estruturados.

---

## Ver Tambem

- `utest/TEST-SPEC.md` - contrato alvo.
- `utest/TEST-PROBLEMS-I-FOUND.md` - achados recentes da migracao.
- `cmds/testio/testio.js` - runner que deve absorver a arquitetura.
- `lib/adapters/io-engine.js` - primitiva IO para log/cache/resultados.
