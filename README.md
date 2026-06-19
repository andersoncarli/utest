# utest/

Especificacao e compatibilidade do runner de testes do FRM. Historicamente
`utest` reuniu descoberta de arquivos, shims de `bun:test`/Jest, `check()`,
viewer compacto e cache barato. A nova direcao e levar essas ideias para
`cmds/testio/testio.js`, usando `lib/adapters/io-engine.js` como trilha de IO.

---

## Direcao Atual

- **Fases explicitas**: `unit`, `tui` e `integration`.
- **Workers por arquivo**: a arquitetura alvo executa cada arquivo em processo
  isolado e paralelizavel.
- **Streaming persistente**: resultados devem poder ser renderizados ao vivo e
  reabertos via IO.
- **Cache por tempo**: manter cache por timestamp, mas comparando segundos
  exatos do alvo/dependencias, nao minutos.
- **Falha visivel**: erro de import/load/shim e erro do modulo alvo deve virar
  resultado de teste, nunca sumir em `catch {}`.

O runner atual em `utest/utest.js` ainda e majoritariamente in-process. Isso e
util para compatibilidade e diagnostico, mas nao deve ser confundido com o
modelo final de isolamento.

---

## Uso

```bash
# Rodar suite específica
bun utest/utest.js utils -v2 --force

# Caminho arquitetural em revisao
bot testio unit -v:2
```

---

## Componentes

| Arquivo | Função |
|---------|--------|
| `utest.js` | CLI atual de compatibilidade, ainda in-process |
| `runner.js` | Execucao modular legada/experimental |
| `worker.js` | Base para execucao isolada por arquivo |
| `scanner.js` | Descoberta de arquivos de teste |
| `viewer.js` | UI de resultados em tempo real |
| `check.js` | Assertions e visual diffing |
| `index.js` | Entry point / exports |
| `setup.js` | Setup do ambiente de teste |
| `shims.js` / `shimmer.js` | Shims para compatibilidade |
| `paths.js` | Resolução de paths |
| `migrate.js` | Migração de formato de testes |

---

## Documentação Interna

| Arquivo | Conteúdo |
|---------|----------|
| `HANDOFF.md` | Handoff da sessão 3 (parallelização e streaming) |
| `TEST-MASTER-PLAN.md` / `TEST-MASTER-PLAN-2.md` | Planos de evolução do runner |
| `TEST-SPEC.md` / `TEST-SPEC-1.md` | Especificações de comportamento |
| `TEST-PROBLEMS-I-FOUND.md` | Achados recentes e limites da migracao |
| `TEST.yaml` | Configuração de testes |

---

## Ver também

- `lib/test-runner.js` — runner principal (usado por `bot test`)
- `cmds/testio/testio.js` — destino arquitetural do runner
- `lib/adapters/io-engine.js` — IO log/cache/result projection
- `tests/` — testes de integração E2E
