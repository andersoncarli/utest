# utest — `HANDOFF.md` avulso na raiz, sem sprint nem data no nome

Encontrado em `~/utest` na sessao de 2026-09-12 ([handoff](../handoffs/260912-023a-sprint-2.0.md)).

---

## Sintoma

`HANDOFF.md` na raiz, 64 linhas, datado `2026-04-24 (Session 3)` no titulo. Nao ha
como saber a que sprint pertence sem le-lo inteiro, e ele nao aparece em nenhum
indice.

## Efeito

Conteudo util (a arquitetura de paralelizacao e streaming do runner) fica orfao. O
`sprint docs` ja o lista como "sem intro (fora da superficie gerenciada)".

## Conserto

Mover para `handoffs/260424-NNN-slug.md`, conforme `HANDOFF-CONVENTION.md`, com o
numero do sprint que a sessao tocou. Descobrir esse numero exige ler o arquivo e
cruzar com `sprints/` da epoca — trabalho pequeno, mas nao automatico.

Enquanto nao for movido, e a evidencia viva do antipadrao que a convencao resolve.
