# utest/

Test runner alternativo do FRM com paralelização por workers e streaming
de resultados em tempo real. Complementa o `bot test` para suites maiores.

---

## Características

- **Paralelo**: Pool de workers via `Bun.spawn` — cada arquivo em processo isolado
- **Streaming**: Resultados em tempo real (`onResult` callback)
- **Isolamento 100%**: Processo fresh por arquivo (resolve problemas de ESM circular deps)
- **Timeout rigoroso**: 1s por arquivo para detectar hogs assíncronos

**Performance** (utils suite, 101 arquivos):
- Sequential: ~25-30s
- Parallel (8 workers): ~6-7s

---

## Uso

```bash
# Rodar suite específica
bun utest/utest.js utils -v2 --force

# Com viewer
bun utest/viewer.js
```

---

## Componentes

| Arquivo | Função |
|---------|--------|
| `utest.js` | CLI principal do runner |
| `runner.js` | Orchestrator do pool de workers |
| `worker.js` | Worker individual (executa um arquivo de teste) |
| `scanner.js` / `scanner2.js` | Descoberta de arquivos de teste |
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
| `TEST.yaml` | Configuração de testes |

---

## Ver também

- `lib/test-runner.js` — runner principal (usado por `bot test`)
- `tests/` — testes de integração E2E
