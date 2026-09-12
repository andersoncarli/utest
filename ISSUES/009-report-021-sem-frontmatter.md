# sprint-cli — `021-*.report.md` sem frontmatter, e o `docs` acusa

Encontrado em `~/utest` na sessao de 2026-09-12 ([handoff](../handoffs/260912-023a-sprint-2.0.md)).

---

## Sintoma

```
$ sprint docs
docs:check — 1 problema(s):
  ✗ sprints/021-utest-sobre-iodb-fswatch.report.md: sem features no frontmatter
```

O arquivo comeca direto no `# 021 — Report: ...`, sem bloco `---` nenhum. Nao e
frontmatter incompleto: e ausente.

## Efeito

O sprint 021 fica **invisivel ao vinculo feature↔sprint**. Numa auditoria da arvore
ele aparece em `sprints_without_features`, e as features que ele tocou (8.1, 8.2,
8.3) contam como se nenhum sprint as tivesse trabalhado.

## Causa provavel

O `021` foi escrito a mao como milestone de tres features, fora do fluxo do
`sprint new`. O `new` gera o par com frontmatter no report; escrever a mao pula isso,
e nada no `close` confere.

## Conserto

Acrescentar o frontmatter ao arquivo migrado (`sprints/021-*.md`), com
`features: ["8.1","8.2","8.3"]`. Ja commitado, entao e edicao de historia — aceitavel
aqui porque o dado esta no corpo do proprio report, nao se inventa nada.

A prevencao e do `sprint-cli`: `close` deveria recusar sprint sem `features`.
