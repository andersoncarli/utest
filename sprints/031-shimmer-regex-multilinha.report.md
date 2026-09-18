---
sprint: 31
date: 2026-09-18
features: [6.2]
thread: null
---
# 031 — shimmer-regex-multilinha

Ancorou o regex que remove o import de `bun:test` nas tres copias que o runner usa — ele atravessava linhas e apagava todo o codigo ate um "bun:test" escrito dentro de uma string, o que zerou as 162 falhas fantasma do ~/soml.

## Objetivo

Um arquivo de teste que apenas MENCIONASSE `bun:test` dentro de uma string
perdia, em silencio, todo o codigo entre o seu primeiro `import` e essa mencao.
O sintoma nao parecia um bug do utest: eram erros arbitrarios e nao
reproduziveis no projeto do usuario (`pixel is not defined`, `Unexpected }`),
que mudavam conforme o escopo rodado — porque o que sumia dependia do conteudo
de cada arquivo.

## A causa

O mesmo regex, copiado em tres lugares:

```js
/import\s+[\s\S]*?from\s+["']bun:test["'];?/g
```

Sem ancora de linha, o `[\s\S]*?` casa do PRIMEIRO `import` do arquivo ate
qualquer `bun:test` — inclusive um dentro de uma string literal. Tudo no meio
virava comentario (`// [utest-shim]`) ou linha vazia.

- `utest.js:101` — o caminho que o binario usa no load (o que de fato quebrava)
- `src/setup.js:27` — o plugin `onLoad`
- `src/shimmer.js:14` — o `shim()`

## O que entregou

- os tres regexes ancorados a `^...$` com `/m`, e sem atravessar outra
  instrucao (`[^;'"{]*?` / `\{[^}]*\}`), em duas formas: import com chaves e
  import default/namespace
- `src/shimmer.t.js` — 13 checks sobre `shim()`, incluindo o caso de regressao:
  uma string contendo `bun:test` NAO pode apagar o codigo acima dela

## Evidencia

- `~/soml`: **✘162 → 0** (3367 checks UNIT + 264 EVAL verdes, mesma contagem de arquivos)
- suite do utest: 671 checks verdes, coverage 57% -> 65%
- 6.2: 🟠 -> 🟡 testada

## Fica aberto

Mesmo defeito de classe, NAO corrigido aqui: `src/shimmer.js:59-60` substitui
`import.meta.dir` / `import.meta.url` dentro de STRINGS tambem. Um teste que
cite essas expressoes como dado quebra a propria sintaxe. Documentado como
comentario em `src/shimmer.t.js`, com o caso de teste deliberadamente ausente.
