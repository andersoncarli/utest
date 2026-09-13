# Prompt — disparar a conformidade num projeto sprint

Cole numa sessão nova (Sonnet dá conta: o trabalho é determinístico), ajustando só a primeira
linha.

---

O projeto é `<PROJETO>`. Você vai levar a história de sprints dele ao formato v2 — **refactoring
de documento, sem reescrever conteúdo** — para que fique navegável por *progressive disclosure*.

A receita completa está em `/home/bittnkr/sprint-cli/docs/sprint-2.0/RECEITA-CONFORMIDADE.md`.
**Leia-a inteira antes de tocar em qualquer coisa.** Ela foi provada em dois projetos e traz os
números esperados, as invariantes e a prova de conservação.

## Faça, nesta ordem

**1. Baseline.** Antes de tocar em nada:

```bash
cd <PROJETO>
bun -e "import{openTree}from'/home/bittnkr/sprint-cli/tools/sprint-template.js';
const t=await openTree('.');console.log(JSON.stringify(await t.gaps(),null,1))" > /tmp/gaps-antes.json
grep -h "^## " sprints/*.md | wc -l
git status --porcelain sprints/    # tem que estar limpo; se não, PARE e pergunte
```

Anote `missing_anchors.asked`, `broken_links`, `totals`, `orphan_features` e o total de seções.

**2. Fase 1 (só se ainda houver pares `.plan.md`/`.report.md`).**
`bun /home/bittnkr/sprint-cli/tools/sprint-codemod.js --dry`, confira, depois `--apply`.
**Nunca `--rm`.**

**3. Fase 2.** Levante o vocabulário do projeto:
`grep -h "^## " sprints/*.md | sort | uniq -c | sort -rn | head -30`
O que aparece muitas vezes vira regra nova no `MAP` de `tools/sprint-normalize.js`. Só igualdade
exata — **prefixo erra**, e a receita explica por quê.

**4. Fase 3 — a redistribuição posicional.**

```bash
bun /home/bittnkr/sprint-cli/tools/sprint-redistribute.js          # dry
```

Antes de aplicar, rode o **loop de conservação** que está na receita (seção "Verificação"). Ele
compara a prosa antes/depois de cada arquivo. **Zero divergências é o portão** — se algum arquivo
divergir, PARE e me diga qual.

Só então: `bun /home/bittnkr/sprint-cli/tools/sprint-redistribute.js --apply`

**5. Verifique** contra o baseline do passo 1. `asked`, `broken_links`, `totals` e
`orphan_features` têm que estar **inalterados**. Rode a suíte do projeto e o portão de docs.

**6. Fase 4 — revisão semântica (opcional, e só depois que 1-5 estiverem verdes).**
As fases anteriores dão conformidade de **forma**; esta dá de **semântica**. A regra da fase 3 é
posicional, então ela empurra texto para a última âncora de cada metade. Levante o recorte com o
snippet da receita (seção "Fase 4") e revise **só as âncoras de alta suspeita** — no sprint-cli
foram 116 das 174 subseções, todas sob `Criterio de pronto` e `O que fica aberto`.

Por subseção, a pergunta é fechada: *"este `###` está sob a âncora certa?"*, e a resposta padrão é
**"sim, deixa como está"**. Mover é recortar o bloco `###` inteiro para outra âncora **da mesma
metade**. Nunca entre PLAN e REPORT. Nunca reescrever texto ou título. Na dúvida, não mova.

Esta fase é incremental: pode rodar sprint a sprint, depois, sem refazer nada.

**7. Fase 5 — adaptação de conformidade v2 (opcional, e só com a 4 commitada).**
Aqui você é **editor e revisor**, e é a única fase em que reescrever é permitido — ela dissolve a
prova de prosa idêntica, então só entre nela com a fase 4 já commitada, para o `git diff` mostrar
o que você mudou.

O critério, e ele é o teste de aceite da fase: **é o MESMO documento** — livre de redundâncias,
com **cada seção descrevendo exatamente o que ela deve descrever**. Não é resumo, não é versão
melhorada. Se ao terminar o sprint conta uma história diferente, ou encolheu por ficar enxuto em
vez de menos repetido, você errou a fase.

O trabalho é remover redundância em três eixos, e a regra do que sobrevive **não é tempo nem
qualidade de escrita** — é a fronteira da v2 (`docs/sprint-2.0/NEW-SPRINT.md` §3, leia antes de
começar): **a ficha carrega INTENT** (o que o sistema deve ser: sem autor, atemporal) e **o sprint
carrega REQUEST** (alguém pedindo algo, agora: com autor, datado).

Separar por tempo não basta, e o §3 explica por quê com um caso real: a regra por tempo *"diz que
houve repetição, não diz qual dos dois textos escrever"*. A tabela de destino do §3 é
**normativa** — consulte-a: objetivo da feature, modelo de dados, contrato, formatos, decisões de
design e riscos permanentes são **ficha**; "por que este sprint existe agora" é **PLAN**.

Na prática: quando ficha e sprint dizem o mesmo, a ficha vence e o sprint cita. Quando PLAN e
REPORT dizem o mesmo, **o REPORT encolhe — o PLAN nunca se edita**, porque a distância entre os
dois é a medida do sprint.

E não trate isso como enxugar bytes. Ainda do §3: *"duplicação é um texto ocupando o lugar de
outro que faltou"* — ao reescrever a seção duplicada como request de verdade, ela costuma ficar
**mais útil**, dizendo o que não estava escrito em lugar nenhum.

Espere pouco trabalho: no sprint-cli são 23 pares ficha↔sprint, 4 sprints com PLAN↔REPORT
sobreposto e 12 pares de parágrafos — e **zero** duplicidade literal. Procure exceções, não faça
varredura. Os snippets que levantam os três eixos estão na receita.

Guardas: nunca apague um fato que aparece uma vez só (se a segunda ocorrência traz número,
caminho ou data que a primeira não tem, é complemento, não duplicidade); nunca invente; preserve
todo número, caminho, comando e nome próprio; **um sprint por commit**; na dúvida, não edite.

## As regras que não se quebram

- **Nunca preencha `asked`.** Se `missing_anchors.asked` cair, você inventou um pedido — reverta.
- **Nunca reescreva prosa.** Só mover e reagrupar.
- **Nunca invente âncora.** São 12.
- **Não commite.** Deixe as mudanças na árvore para revisão humana.

## Relate

- a tabela antes/depois das invariantes;
- arquivos tocados e seções absorvidas;
- o resultado do loop de conservação (tem que ser "prosa idêntica: N/N");
- as seções que a regra posicional colocou numa âncora que não as descreve — elas são a
  **segunda passagem** (revisão de leitura), não um defeito a consertar agora.
