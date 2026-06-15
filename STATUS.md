# Status: utest/

Atualizado: 2026-06-14

Test runner alternativo com parallelização por workers. Funcional para suites
grandes. Alguns testes de `utils/src` têm falhas de lógica (split.js, toSource.t.js).

---

## Estado: FUNCIONAL (com falhas conhecidas)

O runner em si está funcional. Falhas conhecidas:
- `utils/src/split.js` — logic mismatch no ambiente unificado
- `utils/src/toSource.t.js` — falha por lógica
- Testes TUI interativos (como `discovery.t.js`) chegam ao timeout de 1s

---

## Próxima Ação

Investigar e corrigir falhas de lógica em `utils/src/` quando o
desenvolvimento do core retornar ao foco.

---

## Ver também

- `utest/HANDOFF.md` — contexto da sessão de paralelização
- `lib/test-runner.js` — runner principal (mais estável)
