# Receita — adaptação de conformidade do corpus de sprints

Como levar a história de um projeto sprint v1 — escrita sem contrato, com redundância entre ficha,
plano e report — a um corpus v2 **navegável e expansível**: cada fato num lugar só, endereçável,
consultável por *progressive disclosure* sem carregar o documento inteiro.

Essa é a razão inteira da receita. Uma história v1 responde abrindo arquivos; uma v2 responde por
endereço, em centenas de bytes, e continua respondendo assim com mil sprints. Provada em dois
projetos em 2026-09-12: `~/sprint-cli` (73 sprints, 129 seções) e `~/utest` (24 sprints, 27
seções).

As fases 1-3 não reescrevem nada (a prova é prosa byte-idêntica). A fase 4 recoloca; a fase 5
edita — e só ela.

Isto é **adaptação de conformidade**, não auditoria. A auditoria mede e não toca; a adaptação
toca e não mede. Nomear as duas igual foi o que fez a primeira tentativa circular — a discussão
girava porque "aplicar a auditoria" não quer dizer nada: uma medição não se aplica, ela informa.

## O que ela entrega

Todo sprint passa a ter só as **12 âncoras canônicas** como seções `##`; o que era título livre
do autor vira `###` dentro da âncora que o precedia. O efeito é o que a v2 precisa:

| pergunta | antes | depois |
|---|---|---|
| "o que é o sprint 074?" | abrir o arquivo (~6 KB) | `view('074')` → **832 B** |
| "quais as âncoras do plano?" | ler o arquivo | `view('074#plan')` → **734 B** |
| "o que ficou aberto no 019?" | ler o arquivo | `at('019#open')` → **805 B** |

O corpus do sprint-cli são ~474 KB (~119k tokens) em disco. Depois da receita, orientar-se nele
custa centenas de bytes por pergunta — nenhuma sessão engole o documento.

São **dois níveis de conformidade**, e eles se entregam separado: as fases 1-3 dão a de **forma**
(as âncoras existem, a árvore navega) e são determinísticas; a fase 4 dá a de **semântica** (cada
bloco sob a âncora que o descreve) e custa leitura. A de forma é o que destrava a v2 — a de
semântica pode vir depois, sprint a sprint.

## Fases 1-3 — conformidade de forma (determinísticas)

Nenhuma delas lê o texto, e todas rodam em segundos sobre qualquer volume. É o que destrava a v2.
As fases 4 e 5, que custam leitura, vêm depois — com suas próprias regras, mais abaixo.

### Fase 1 — codemod (par → arquivo único)

Só se o projeto ainda tem `NNN-slug.plan.md` + `NNN-slug.report.md`.

```bash
cd <PROJETO>
bun <sprint-cli>/tools/sprint-codemod.js --dry     # confere que nenhuma seção some
bun <sprint-cli>/tools/sprint-codemod.js --apply   # NÃO use --rm: o par fica como conferência
```

Deliberadamente burro: une os dois sob `# PLAN`/`# REPORT` e **não renomeia nada**.

### Fase 2 — normalize determinístico (títulos por igualdade exata)

Renomeia só o que casa **exatamente** com um sinônimo conhecido. Antes de rodar, levante o
vocabulário do projeto e acrescente ao `MAP` de `sprint-normalize.js` o que aparece muitas vezes:

```bash
grep -h "^## " sprints/*.md | sort | uniq -c | sort -rn | head -30
```

Casar por **prefixo erra** — "O que muda, e o que não muda" começa com "o que mud" e viraria
`what`, mas é escopo de plano, não entrega. Igualdade renomeia sozinha; prefixo pede leitura.

### Fase 3 — redistribuição posicional (o que sobra)

O que a fase 2 não cobriu. **Regra única, determinística, sem leitura:**

> Toda seção de título livre é absorvida pela **última âncora canônica acima dela**, na mesma
> metade. O título do autor vira `###` dentro da âncora. Não havendo âncora acima, vai para a
> genérica da metade (`why_now` no PLAN, `what` no REPORT).

```bash
cd <PROJETO>
bun <sprint-cli>/tools/sprint-redistribute.js                    # dry: quantos arquivos/seções
bun <sprint-cli>/tools/sprint-redistribute.js sprints/NNN-x.md   # vê o resultado de um só
bun <sprint-cli>/tools/sprint-redistribute.js --apply
```

**Por que "acima" e não "abaixo":** medido. Pra frente, 129 de 129 seções não têm âncora abaixo
(as livres sempre vêm depois das canônicas) e a regra degenera num balde só.

**Por que `###` e não `**negrito**`:** 235 dos 244 blocos são prosa plana. Negrito no meio do
texto vira ênfase, não estrutura — e some da navegação.

## A regra que não se quebra

> **Normalizar não pode falsificar histórico.**

- **Nunca preencha `asked`** num sprint legado. O pedido original não existe mais, e o vazio é o
  dado. Se `missing_anchors.asked` cair, alguém inventou pedido — reverta.
- **Nunca reescreva prosa.** A receita move e reagrupa; não edita texto.
- **Nunca invente âncora.** São 12, e o contrato cresce por decisão, não por acidente.

## Verificação — antes e depois, sempre

```bash
# BASELINE, antes de tocar em nada
bun -e "import{openTree}from'<sprint-cli>/tools/sprint-template.js';
const t=await openTree('.');console.log(JSON.stringify(await t.gaps(),null,1))" > /tmp/gaps-antes.json
grep -h "^## " sprints/*.md | wc -l
```

Depois de aplicar, estes têm que estar **inalterados**:

| invariante | por quê |
|---|---|
| `missing_anchors.asked` | se caiu, inventou-se pedido |
| `broken_links` | tem que seguir 0 |
| `totals.intents` / `requests` | nada entrou nem sumiu |
| `orphan_features` | a receita não mexe em vínculo |

E a prova de que nada foi reescrito — **prosa byte-idêntica**:

```bash
for f in sprints/*.md; do
  case "$(basename $f)" in _*) continue;; esac
  bun <sprint-cli>/tools/sprint-redistribute.js "$f" > /tmp/depois.md
  diff <(grep -v "^#" "$f" | grep -v "^$" | sort) \
       <(grep -v "^#" /tmp/depois.md | grep -v "^$" | sort) >/dev/null \
    || echo "DIVERGE: $f"
done
```

Rode isso **antes** do `--apply`. Zero divergências é o portão.

Por fim: a suíte do projeto e o portão de docs seguem verdes.

## Resultado medido nos dois projetos

| | sprint-cli | utest |
|---|---|---|
| sprints | 73 | 24 (23 + `_TOC.md`) |
| seções livres antes | 129 | 27 |
| seções livres depois | **0** | **0** |
| arquivos tocados | 51 | 13 |
| `##` → | 454 → 326 | 159 → 132 |
| `###` → | 45 → 174 | 18 → 45 |
| prosa idêntica | **73/73** | **23/23** |
| `asked` | 72 → **72** | 21 → **21** |
| `broken_links` | 0 → **0** | 0 → **0** |

## Fases 4-5 — conformidade de semântica (custam leitura)

As duas são **opcionais e incrementais**: a árvore já navega desde a fase 3, e estas só melhoram a
precisão. Rodam sprint a sprint, meses depois, sem refazer nada. A fase 4 **recoloca** blocos sem
tocar em prosa; a fase 5 **edita** — e é a única que pode.

### Fase 4 — revisão semântica por LLM

As fases 1 a 3 dão conformidade de **forma**: todo sprint tem só as 12 âncoras como `##`, e a
árvore é navegável. Não dão conformidade de **semântica** — a regra da fase 3 é posicional, então
onde o autor escreveu continuação de plano depois do critério de pronto, o texto ficou sob uma
âncora que não o descreve.

Nada se perdeu (o `###` preserva o título original, `view`/`at` navegam), e por isso esta fase
**não bloqueia nada**. Mas é ela que fecha a conformidade de verdade.

#### Por que agora funciona, e antes não

Tentar isto **antes** da fase 3 é a armadilha, e ela foi medida: no sprint-cli havia **109
títulos distintos entre 111 seções livres — só 2 repetiam**. Não existia regra a extrair, então
seriam 111 julgamentos abertos, com o LLM escolhendo entre 12 âncoras sem âncora nenhuma no
arquivo para se orientar. Caro, intransferível, e cada decisão uma chance de deslocar o sentido
de um sprint fechado.

Depois da fase 3 o trabalho é outro: o revisor não escolhe do zero, **confere uma colocação que
já existe**. É uma pergunta fechada por subseção — *"este `###` está sob a âncora certa?"* — com
resposta padrão "sim, deixa como está".

#### O recorte: onde a suspeita se concentra

Não revise as 174 subseções. A regra posicional erra de um jeito previsível — empurra para a
**última âncora de cada metade** —, então a suspeita se concentra ali. Medido no sprint-cli:

| âncora de destino | `###` | suspeita |
|---|---|---|
| `plan:Criterio de pronto` | 67 | **alta** — última do PLAN |
| `report:O que fica aberto` | 49 | **alta** — última do REPORT |
| `plan:Plano de materializacao` | 17 | baixa |
| `report:O que aconteceu` | 14 | baixa |
| `report:Prova` | 13 | baixa |
| `plan:Por que este sprint existe agora` | 11 | baixa |
| `report:Onde o PLAN errou` | 3 | baixa |

**116 das 174 estão nas duas âncoras finais.** Comece por elas; as outras 58 caíram sob âncoras
que muito provavelmente já as descrevem.

Levante o seu recorte com:

```bash
bun -e '
import{readdirSync,readFileSync}from"fs";
const por={};
for(const f of readdirSync("sprints").filter(n=>!n.startsWith("_")&&n.endsWith(".md"))){
  const L=readFileSync("sprints/"+f,"utf8").split("\n");let anc=null,half=null;
  for(const l of L){
    const H=/^# (PLAN|REPORT)\s*$/.exec(l); if(H){half=H[1].toLowerCase();anc=null;continue}
    const A=/^##\s+(.+?)\s*$/.exec(l); if(A){anc=A[1];continue}
    const S=/^###\s+(.+?)\s*$/.exec(l);
    if(S&&anc)(por[`${half}:${anc}`]??=[]).push(`${f} — ${S[1]}`)}}
Object.entries(por).sort((a,b)=>b[1].length-a[1].length)
  .forEach(([k,v])=>console.log(String(v.length).padStart(3),k))'
```

#### O protocolo

Um arquivo por vez, do mais novo para o mais velho (vocabulário mais próximo do contrato).
Para cada `###` sob uma âncora de alta suspeita:

1. Leia **só aquela subseção** (`at('NNN#done_when')`), não o arquivo inteiro.
2. Pergunte o que o texto **faz**, não do que ele fala: descreve motivo → `why_now`; lista passos
   → `steps`; mostra evidência ou medição → `proof`; lista pendência → `open`; conta entrega →
   `what`.
3. Na dúvida, **deixe onde está**. "Talvez encaixe melhor" não é motivo para mover um sprint
   fechado; o custo de mover errado é maior que o de uma âncora imprecisa.
4. Mover é só recortar o bloco `###` inteiro (título + corpo) e colá-lo sob outra âncora **da
   mesma metade**, na ordem canônica. Nunca entre metades: o PLAN é o que se pensou, o REPORT é o
   que aconteceu, e trocar isso falsifica história.

#### O que esta fase NÃO pode fazer

Valem todas as regras da receita, e mais duas:

- **Não mova entre PLAN e REPORT**, nem crie/remova subseção.
- **Não preencha `asked`.** Se `missing_anchors.asked` cair, inventou-se pedido.

### Fase 5 — adaptação de conformidade v2 (o revisor LLM)

O trabalho de **editor e revisor**, e o critério é este:

> **É o MESMO documento** — livre de redundâncias, com **cada seção descrevendo exatamente o que
> ela deve descrever**.

Essa frase resolve a ambiguidade entre editar e reescrever. Não é um resumo, não é uma nova
versão, não é o texto "melhorado": é o mesmo sprint, com cada fato no lugar que a v2 define para
ele e dito **uma vez só**. Se ao terminar o sprint conta uma história diferente, ou se ele
encolheu porque ficou mais enxuto em vez de menos repetido, a fase falhou.

É a última fase, e a única em que reescrever é permitido.

**Ela muda o contrato**, e isso precisa ser dito na cara: as fases 1-4 se sustentam na prova de
prosa byte-idêntica, e a fase 5 a dissolve. Só entre nela com a fase 4 fechada e commitada, para
que o `git diff` de cada sprint mostre exatamente o que o editor mudou.

#### Os três eixos de redundância, e quem é o dono de cada fato

Depois da estrutura grossa, o revisor reorganiza e remove redundância em **três eixos**. A regra
que decide o que sobrevive não é qualidade de escrita, e **não é tempo** — é a fronteira da v2,
`NEW-SPRINT.md` §3:

> **A ficha da feature carrega INTENT. O sprint carrega REQUEST.**
> Intent: *o que o sistema deve ser* — sem autor, atemporal, verbo "é/deve/nunca".
> Request: *alguém pedindo algo, agora* — tem autor, datado, verbo "extrair/medir/plugar".

Por que não separar por tempo, que seria o óbvio: o `NEW-SPRINT.md` registra que essa foi a
primeira formulação e que ela **não basta** — intent é atemporal *porque* não tem autor, não o
contrário. A diferença é prática, e o caso do sprint 022 provou: sob a regra por tempo, o
objetivo da feature foi duplicado dentro do sprint e a regra não impediu, porque *"ela diz que
houve repetição, não diz qual dos dois textos escrever"*. Sob intent vs request a pergunta se
responde sozinha — *"por que este sprint existe"* não pode ser respondido com intent, porque
intent não tem "agora".

**A tabela de destino do §3 é normativa** — consulte-a, não improvise: objetivo da feature,
modelo de dados, contrato, formatos, decisões de design e riscos permanentes são **ficha**; "por
que este sprint existe agora" é **PLAN**.

E é por isso que a fase 5 não é cosmética. Ainda do §3:

> *"Duplicação não é só desperdício de bytes: é um texto ocupando o lugar de outro que faltou."*

Quando a seção duplicada do 022 foi reescrita como request de verdade — *a 8.3 está bloqueada por
falta de régua; a janela é boa porque fswatch está desligado em produção* — ela não ficou só
menor, ficou **útil**, dizendo algo que não estava escrito em lugar nenhum. O revisor não está
enxugando texto: está recuperando o texto que a duplicação escondeu.

| eixo | quando duplica | quem sobrevive |
|---|---|---|
| **ficha ↔ sprint** | o sprint reexplica o que a feature já declara | a **ficha**; o sprint cita e segue |
| **PLAN ↔ REPORT** | o REPORT reconta o plano em vez de contar o resultado | o **REPORT** conta só o que mudou; o PLAN fica intacto |
| **dentro da seção** | o mesmo fato recontado em outras palavras | a ocorrência mais **específica** (a que traz número, caminho, data) |

**O PLAN não se edita, nunca** — nem na fase 5. Ele é o que se pensou, selado; a distância entre
ele e o REPORT é a medida do sprint. Quando os dois dizem o mesmo, quem encolhe é o REPORT.

#### O tamanho real do trabalho

Medido no sprint-cli, e é pequeno — o revisor procura **exceções**, não faz varredura:

| eixo | ocorrências |
|---|---|
| parágrafos **idênticos** | **0** — duplicidade literal não existe |
| ficha ↔ sprint ≥8% | **23 pares** (o maior, 20%) |
| PLAN ↔ REPORT ≥15% | **4 sprints** de 73 (o maior, 26%) |
| parágrafos ≥40% dentro do mesmo sprint | **12 pares** |

Os limiares importam: a 20% não havia **nenhum** par ficha↔sprint, e foi preciso baixar para 8%
para achar 23. Isso diz que a duplicação é de **enquadramento**, não de texto — o mesmo assunto
dito de dois pontos de vista, que muitas vezes é legítimo.

- **Funde os `###` redundantes** na prosa da âncora, quando o título do autor não acrescenta
  endereço — um `### O que mudou` dentro de `## O que aconteceu` é ruído estrutural.
- **Uniformiza o registro** — tempo verbal, pessoa, densidade — sem trocar o vocabulário técnico
  do autor.

Levante os três eixos com os snippets abaixo. Primeiro, dentro do sprint:

```bash
bun -e '
import{readdirSync,readFileSync}from"fs";
const norm=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const sh=s=>{const w=norm(s).split(" ");const g=new Set();
  for(let i=0;i+8<=w.length;i++)g.add(w.slice(i,i+8).join(" "));return g};
for(const f of readdirSync("sprints").filter(n=>!n.startsWith("_")&&n.endsWith(".md"))){
  const ps=readFileSync("sprints/"+f,"utf8").split(/\n\s*\n/).map(s=>s.trim())
    .filter(s=>s.length>120&&!s.startsWith("|")&&!s.startsWith("```")&&!s.startsWith("#"));
  for(let i=0;i<ps.length;i++)for(let j=i+1;j<ps.length;j++){
    const A=sh(ps[i]),B=sh(ps[j]);if(A.size<5||B.size<5)continue;
    let n=0;for(const g of B)if(A.has(g))n++;
    const pct=Math.round(n/Math.min(A.size,B.size)*100);
    if(pct>=40)console.log(`${f} ${pct}%: ${norm(ps[j]).slice(0,60)}...`)}}'
```

E os dois eixos entre documentos — ficha↔sprint e PLAN↔REPORT:

```bash
bun -e '
import{readdirSync,readFileSync}from"fs";
const norm=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const sh=(s,n)=>{const w=norm(s).split(" ");const g=new Set();
  for(let i=0;i+n<=w.length;i++)g.add(w.slice(i,i+n).join(" "));return g};
const ov=(A,B)=>{let n=0;for(const g of B)if(A.has(g))n++;return Math.round(n/B.size*100)};
for(const f of readdirSync("sprints").filter(x=>!x.startsWith("_")&&x.endsWith(".md"))){
  const t=readFileSync("sprints/"+f,"utf8");
  const i=t.indexOf("\n# REPORT");
  if(i>0){const P=sh(t.slice(0,i),8),R=sh(t.slice(i),8);
    if(P.size>19&&R.size>19){const p=ov(P,R);
      if(p>=15)console.log(`PLAN<->REPORT ${p}%  ${f}`)}}
  const m=/^features:\s*\[(.*?)\]/m.exec(t); if(!m)continue;
  const S=sh(t,6); if(S.size<20)continue;
  for(const ft of m[1].split(",").map(x=>x.trim().replace(/^"|"$/g,"")).filter(Boolean)){
    const d=readdirSync("plans").find(x=>x.startsWith(ft.split(".")[0]+"-")); if(!d)continue;
    const fi=readdirSync("plans/"+d).find(x=>x.startsWith(ft+"-")); if(!fi)continue;
    const F=sh(readFileSync(`plans/${d}/${fi}`,"utf8"),6); if(F.size<20)continue;
    const p=ov(S,F); if(p>=8)console.log(`ficha<->sprint ${p}%  ${ft} <-> ${f}`)}}'
```

#### As guardas, já que a conservação caiu

O portão da fase 5 não é a prosa idêntica — é **o fato preservado**:

- **Nunca apague um fato que só aparece uma vez.** Duplicidade é o mesmo fato duas vezes; se a
  segunda ocorrência traz um número, um caminho de arquivo ou uma data que a primeira não tem,
  **não é duplicidade** — é complemento.
- **Nunca invente.** Nenhum fato novo, nenhuma conclusão que o autor não escreveu, nenhum `asked`.
- **Um sprint por commit.** O diff é a revisão; um commit com trinta sprints editados é
  irrevisável, e a fase 5 é a única que pode causar dano silencioso.
- **Preserve todo número, caminho, comando e nome próprio** — são a evidência do sprint.
- **Na dúvida, não edite.** Um sprint fechado com prosa redundante é melhor que um sprint fechado
  com um fato a menos.

#### Verificação

`gaps()` inalterado (as mesmas invariantes), a suíte e o portão de docs verdes. E uma checagem
que só esta fase precisa: **os números não sumiram**.

```bash
# antes e depois, por sprint: todo numero, caminho e comando continua la
grep -oE '[0-9]+([.,][0-9]+)?|`[^`]+`' sprints/NNN-x.md | sort | uniq -c > /tmp/fatos-antes.txt
```

#### Custo, e por que ela é a última

É a fase mais cara — leitura e escrita de prosa, sprint a sprint — e a de menor retorno por
token: a árvore **já navega** desde a fase 3. Ela é **opcional e incremental**: rode nos sprints
que alguém for de fato reler, ou nos mais recentes, e deixe o resto como está.

Para milhares de sprints, o custo por sprint é o que importa, e o dela não amortiza — enquanto as
fases 1-3 rodam em segundos sobre qualquer volume.

### Escala — o que sustenta milhares de sprints, e o que não

Medido: 73 sprints são 413 KB, mediana de **5,2 KB por sprint**. Projetando mil sprints, ~5 MB de
corpus. O que a receita entrega escala, e o que não escala é conhecido:

| | 73 sprints | ~1000 sprints |
|---|---|---|
| `view('NNN')` | ~800 B | **~800 B** — constante, não depende do corpus |
| `at('NNN#open')` | ~800 B | **~800 B** — constante |
| `board()` | 11 KB | ~150 KB — **cresce linear** |
| `index()` | 32 KB | ~450 KB — **cresce linear, já viola o teto hoje** |

A navegação **por endereço** é O(1) e é o que a v2 usa no dia a dia. Os verbos de **agregação**
crescem com o corpus, e `index()` já estoura o teto de 12 KB com 73 sprints — em mil, é
inutilizável sem paginação ou filtro. Isso é trabalho da v2, não da receita, mas quem planeja
milhares de sprints precisa saber que o gargalo mora ali, e não no tamanho do corpus.

## Bug conhecido no `sprint-normalize.js`

O `MAP` mapeia `proxima acao` → `next_action`, âncora que **não existe** no `SPRINT-SCHEMA.md`. O
tool cai no ramo "título livre" e o mapa errado passa despercebido. Vale para qualquer projeto que
rode a migração. A fase 3 absorve essas seções de qualquer forma, então não bloqueia — mas o `MAP`
precisa ser corrigido quando `tools/` for absorvido pela v2.
