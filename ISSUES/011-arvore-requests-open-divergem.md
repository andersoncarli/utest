# utest — `requests()` e `open()` divergem em nos profundos da arvore

Encontrado em `~/utest` na sessao de 2026-09-12 ([handoff](../handoffs/260912-023a-sprint-2.0.md)).

---

## Sintoma

`sprint-template.js` expoe duas vias para o mesmo conteudo, e elas nao concordam:

- `open(addr)` navega e devolve nos com `_kind`, `_line`, `_path`
- `requests()` colhe e devolve valores prontos

Para `022#plan.steps`, `open()` devolve vazio enquanto `requests().steps` devolve 14
strings — e `steps('022')` devolve os 9 passos corretos, estruturados.

## Efeito

Baixo. As tres vias funcionam para o que cada uma serve, e `steps()` (a via correta
para passos) esta certa. Mas duas vias que discordam sao um bug esperando quem
confie na errada.

## Causa

`requests()` foi escrito antes de `view()`/`steps()` e mantem sua propria travessia,
com `blocks()` misturando bullets e passos numerados.

## Conserto

Fazer `requests()` delegar a `view()` e `steps()` em vez de reimplementar a
travessia. Uma via so.
