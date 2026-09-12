---
sprint: "014"
slug: "test-yaml-vira-proje-o-utest-test-yaml-hist-rico-utest-test-jsonl"
title: "TEST.yaml vira projeção .utest/TEST.yaml + histórico .utest/TEST.jsonl"
features: ["8.2"]
budget: null
state: "closed"
opened: "2026-09-06"
closed: "2026-09-06"
migrated: "0.2"
---

# 014 — TEST.yaml vira projeção .utest/TEST.yaml + histórico .utest/TEST.jsonl

Plano do sprint 014 (feature 8.2). A preencher: objetivo, passos concretos (arquivo exato, o que muda, comando de verify) e criterio de pronto.

# PLAN

## Por que este sprint existe agora

A preencher.

# REPORT

`state.js` — `.utest/STATE`: histórico append-only de rodadas de scan sobre o `iodb`,
com deteção de mudança de `TEST.yaml` (`configChanged`) e um id canônico e estável por
arquivo (`fileId`), sem tocar no `TEST.yaml` da raiz.

## O que aconteceu

Dar rastreabilidade ao que cada scan realmente viu — quais arquivos entraram, o que foi
podado, por fase — e detectar quando a config mudou desde o último scan, sem reprocessar
o histórico inteiro. `TEST.yaml` na raiz não muda: continua sendo o config editado à
mão. `state.js` abre `.utest/STATE` (mesma infraestrutura do `ledger.js`, 8.1) e grava um
registro agregado por rodada (`{phase, included, excluded, configHash, at}`), comparando
o `configHash` do último registro contra o hash atual do `TEST.yaml` para expor
`configChanged` — usado por `utest.js` para avisar (não forçar) que um `--force` é
recomendado depois de editar a config. Estendido, ainda dentro do escopo desta feature,
para dar a cada arquivo NUNCA visto antes um registro individual (`file:added`) cuja
chave no `iodb` — já única e criptograficamente encadeada por construção — vira o `id`
canônico daquele arquivo (`fileId(path)`), estável entre rodadas.
