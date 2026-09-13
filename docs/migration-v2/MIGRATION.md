# Migração de conformidade — sprints v1 → v2

Registro paralelo de decisões e aprendizados durante a adaptação de conformidade do corpus de
`sprints/`, seguindo `sprints/_PROMPT-CONFORMIDADE.md` e `sprints/_RECEITA-CONFORMIDADE.md`
(a receita e o prompt vivem em `~/sprint-cli/docs/sprint-2.0/`, cópias locais temporárias aqui).

Não é um sprint — é bloco de notas da migração em si, para não perder contexto entre sessões.

## Estado

- **Fases 1-2** (codemod par→arquivo único, normalize por igualdade exata): já feitas antes
  desta sessão (não há mais pares `.plan.md`/`.report.md` no projeto).
- **Fase 3** (redistribuição posicional): aplicada e verificada — prosa byte-idêntica em 23/23
  sprints, `##` 159→142 (menos do que a medição anterior de 132, porque a Fase 4 recriou algumas
  âncoras canônicas que ainda faltavam, contando como `##` novos).
- **Fase 4** (revisão semântica): aplicada em 12 arquivos com subseções sob âncora de alta
  suspeita — 001, 006, 007, 008, 011, 015, 016, 017, 018, 019, 020, 021. Delegada a subagentes,
  um por sprint, em paralelo. Todos verificados com diff de prosa vazio contra
  `sprint-redistribute.js`. Invariantes de `gaps()` intactas: `asked` 21→21, `broken_links` 0→0,
  `totals.intents/requests` 41/23→41/23. Suite verde (630 checks). **022 foi pulado**: REPORT
  ainda "a preencher", sprint aberto — Fase 4 não se aplica a sprint não fechado.
- **Fase 5** (coerência intent-na-ficha / request-no-sprint, zero repetição PLAN↔REPORT): em
  andamento.

## Decisões e padrões encontrados na Fase 4 (podem repetir em outros projetos)

- **"Diagnóstico" é ambíguo por padrão**: em quase todo sprint que tinha essa subseção, ela
  apareceu tanto no PLAN (causa raiz do problema, deveria estar em `## Por que este sprint
  existe agora`, não em `## Criterio de pronto`) quanto no REPORT (confirmação do diagnóstico
  já investigado, deveria estar em `## O que aconteceu`, não em `## O que fica aberto`). Padrão
  recorrente: 017, 018, 019.
- **"Frentes / features tocadas" e metadado de escopo** (tabelas feature→efeito) foram
  sistematicamente mal colocados em `## Onde o PLAN errou` pela regra posicional — pertencem a
  `## O que aconteceu` (007, 008, 006 com "Estado das frentes...").
- **Falta de `## O que aconteceu` no arquivo** faz a Fase 3 empurrar todo o corpo do REPORT para
  `## O que fica aberto` ou `## Prova` (a última âncora disponível) — nesses casos a Fase 4 cria
  a âncora canônica que faltava, na posição certa, e move o bloco. Aconteceu em 020 e 021 (dois
  sprints "milestone" com REPORT extenso e sem essa âncora no autor original).
- **Não confundir narrativa de investigação com "Prova"**: "Prova" deveria ser evidência concisa
  (comandos + saída), não a história de como se chegou lá. Em 020, 5 subseções narrativas
  estavam sob `## Prova`; 4 foram para `## O que aconteceu`, 1 ("reportado, não consertado") para
  `## O que fica aberto`.
- **Sprint 022 ficou de fora da Fase 4** por estar aberto (REPORT "a preencher") — regra geral:
  não vale a pena rodar Fase 4 em sprint não fechado, aguardar o fechamento primeiro.

## Fase 5 — objetivo desta etapa

Conforme pedido do usuário: verificar e corrigir a **coerência entre frente/feature e seus
sprints**. A fronteira (receita, `NEW-SPRINT.md` §3):

> A ficha da feature carrega **INTENT** (o que o sistema deve ser: sem autor, atemporal).
> O sprint carrega **REQUEST** (alguém pedindo algo, agora: com autor, datado).

Quando ficha e sprint dizem o mesmo, a ficha vence e o sprint cita. Quando PLAN e REPORT dizem
o mesmo, o REPORT encolhe — o PLAN nunca se edita.

## Fase 5 — levantamento dos três eixos (medido)

Escala bem menor que o sprint-cli (23 sprints vs 73). Rodados os três snippets da receita:

| eixo | ocorrências no utest | maior % |
|---|---|---|
| ficha ↔ sprint (≥8%) | **4 pares**: 2.7↔016, 4.6↔009, 2.1↔003, 2.6↔011 | 15% (4.6↔009) |
| PLAN ↔ REPORT (≥15%) | **2 sprints**: 010, 012 | 21% (010) |
| parágrafo intra-sprint (≥40%) | **7 pares** em 010, 011 (x2), 012, 017 (x2), 019 | **100%** (011!) |

O achado de maior prioridade é o par 100% em `011-results-json-arbitra-o-cache-segunda-checagem-sobre-o-mtime-cravado.md` — duplicidade quase literal de parágrafo, não só enquadramento repetido. Processar esse primeiro.

## Fase 5 — execução

### 011 — duplicidade literal (100% e 66%), processado

Dois blocos duplicados no mesmo arquivo:
1. A intro do sprint (topo, antes de `# PLAN`) repetia palavra-por-palavra o primeiro
   parágrafo de `## Por que este sprint existe agora` — 100% idêntico. A intro virou
   uma linha curta que cita a seção completa em vez de reconta-la.
2. `## O que aconteceu` → **Objetivo** recontava o mesmo motivo do PLAN (66% overlap) sem
   acrescentar fato novo. Regra "REPORT encolhe quando duplica o PLAN" aplicada: virou
   citação de 2 linhas. O PLAN não foi tocado.

Verificado: `cache.t.js` segue verde (178 checks), `gaps()` com `asked`/`broken_links`/
`intents`/`requests` inalterados.

### 010, 012 — PLAN↔REPORT ≥15%, processados

Ambos tinham o REPORT recontando quase todo o diagnóstico/plano do PLAN em prosa quase
idêntica (010: 21%; 012: 17%). Regra aplicada: REPORT encolhe, cita o PLAN, mantém só o
que é genuinamente do resultado (o que mudou além do previsto, provas). PLAN intocado nos
dois.

### 017, 019 — duplicidade intra-sprint restante, processados

017 tinha dois pares de parágrafo repetidos entre "Diagnóstico (confirmado)" (PLAN) e
"Diagnóstico" (REPORT) — mesma explicação técnica do bug de regex glob, com tabela e repro
no PLAN e quase a mesma prosa no REPORT. Encolhido o REPORT para citar o PLAN, preservando
o único fato extra que lá havia (o bug de `path.resolve` duplicando o caminho por causa do
`process.chdir`).

019 tinha um overlap fraco (56%) entre a intro do arquivo e a intro de "O que aconteceu" —
mera repetição da frase "sprint guarda-chuva...". Reduzido mantendo o fato específico
("primeira leva: a saída de utest <arquivo>").

### Guarda de fatos — verificação e uma correção

Rodada a checagem "números/caminhos/comandos não sumiram" (grep de números e crases,
antes/depois) nos 5 sprints editados. Achou 1 perda real: o REPORT de 011 tinha o total
calculado "~56s" (soma de 22s+34s, que só aparecia ali) — restaurado na versão encolhida.
Os demais itens sinalizados pelo diff eram variações textuais triviais do mesmo fato já
preservado no PLAN (nomes de função repetidos, formas de código quase idênticas) — não
perda real, confirmado por grep cruzado.

### Ficha ↔ sprint — nenhuma edição

4 pares levantados (2.7↔016 11%, 4.6↔009 15%, 2.1↔003 8%, 2.6↔011 11%), todos abaixo do
limiar em que a receita achou algo editável no sprint-cli (lá, só a 8% apareceram pares, e
o maior era 20%). Inspecionado o par mais forte (4.6↔009): a ficha tem `## Objetivo`
(intent, atemporal) e o sprint tem `## Por que este sprint existe agora` (request, datado)
— dizem coisa parecida mas de pontos de vista diferentes, exatamente o padrão que a receita
chama de "enquadramento legítimo". Nenhuma edição feita nesse eixo.

## Estado final da Fase 5

Suite verde (630 checks), `gaps()` com `asked` 21, `broken_links` 0, `intents`/`requests`
41/23 — idênticos ao baseline do início da sessão. Todas as mudanças (Fase 3+4+5) staged,
nada commitado — aguardando decisão do usuário sobre o commit.
