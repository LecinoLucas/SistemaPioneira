# Teste Manual da Importacao de Vendas

Objetivo: validar rapidamente se o vinculo de produto na importacao esta funcionando na tela.

## Preparacao

Antes de testar, garanta que exista pelo menos:

- 1 produto em estoque com nome contendo `colchao`
- 1 produto em estoque com marca conhecida, por exemplo `Ecoflex`
- 1 produto em estoque com medida conhecida, por exemplo `1.38x1.88`

## Passo a passo

1. Abra a tela de `Vendas`.
2. Clique em `Importar`.
3. Importe um PDF com pelo menos 1 item.
4. Na linha do item importado, clique em `Buscar produto no estoque...`.
5. Digite `colchao`.

Resultado esperado:
- aparece pelo menos um produto com `colchao` no nome
- se houver sugestao forte, ele aparece em `Melhores sugestoes`
- o restante continua visivel em `Todo o estoque`

6. Limpe a busca e digite a marca, por exemplo `ecoflex`.

Resultado esperado:
- aparece produto compativel pela marca

7. Limpe a busca e digite a medida, por exemplo `1.38x1.88`.

Resultado esperado:
- aparece produto compativel pela medida

8. Digite um texto que nao exista, por exemplo `produto inexistente xyz`.

Resultado esperado:
- aparece o aviso `Sem sugestao direta. Exibindo todo o estoque para escolha manual.`
- o estoque continua listado para escolha manual

9. Selecione um produto em uma linha e tente escolher o mesmo produto em outra linha do mesmo draft.

Resultado esperado:
- o produto aparece como `ja usado` e nao deve ser escolhido novamente para outra linha

10. Se existir um produto ja vinculado na linha atual e ele estiver sem estoque, abra o combobox dessa mesma linha.

Resultado esperado:
- o produto atual ainda aparece para manter o vinculo visivel

## Sinais de problema

Se algo estiver errado, normalmente voce vai ver um destes sintomas:

- ao digitar, nenhum produto aparece mesmo existindo estoque
- o estoque some totalmente quando nao ha sugestao direta
- busca por marca ou medida nao retorna itens
- o mesmo produto pode ser vinculado em duas linhas do mesmo draft

## Comandos de validacao usados no projeto

```bash
pnpm exec vitest run server/product-link-combobox.test.ts
pnpm exec tsc --noEmit --pretty false
```
