# UI Guidelines

Este guia define o padrão visual e de responsividade do sistema para manter consistência e facilitar manutenção.

## 1) Princípios

- Mobile first.
- Consistência acima de preferência local.
- Acessibilidade mínima garantida (foco visível + alvos de toque maiores).
- Evitar retrabalho: priorizar ajustes nos componentes base (`ui/*`) antes de corrigir tela por tela.

## 2) Escala de Títulos

- Título principal de página:
  - `text-2xl sm:text-3xl font-bold`
- Subtítulo:
  - `text-muted-foreground mt-2`

## 3) Espaçamento de Página

- Padrão de página:
  - `space-y-6`
- Páginas com padding próprio:
  - `p-4 sm:p-6`
- Blocos de seção:
  - `Card` com `CardHeader` + `CardContent`

## 4) Botões (Toque + Layout)

- Botões em barras de ação devem quebrar no mobile:
  - container: `flex flex-wrap gap-2`
  - botão: `w-full sm:w-auto` quando fizer sentido
- Alvo de toque:
  - altura mínima garantida via componente base (`Button`):
    - mobile: `h-10`
    - desktop: `md:h-9`

## 5) Inputs e Selects

- Altura padrão (global via componente):
  - mobile: `h-10`
  - desktop: `md:h-9`
- Em grids de filtros:
  - `grid gap-4 md:grid-cols-2 xl:grid-cols-4` (ou equivalente por contexto)

## 6) Tabs

- `TabsList` sempre com largura controlada:
  - `grid w-full ...`
- Em tabs com muitos rótulos:
  - `TabsTrigger` com `text-[11px] sm:text-sm` e `px-2`
- Altura de toque já aplicada globalmente no componente de tabs.

## 7) Tabelas

- Toda tabela deve ficar dentro de container com overflow:
  - `div.rounded-md.border.overflow-auto`
- Evitar quebrar layout horizontal em telas pequenas.
- Para listas longas:
  - combinar `overflow-auto` com `max-h-*` quando necessário.

## 8) Header de Tela

- Estrutura recomendada:
  - `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- Ações no topo:
  - `flex flex-wrap gap-2`

## 9) Foco Visível e Estados

- Manter foco visível (`focus-visible:ring-*`) nos componentes interativos.
- Hover e active suaves, sem animações excessivas.
- Não remover `outline` sem substituição de foco acessível.

## 10) Checklist Antes de Fechar uma Tela

- Em 320/375px:
  - nenhum botão “estoura” horizontalmente
  - tabs continuam legíveis
  - tabelas não quebram layout
- Em 768px:
  - grids reorganizam corretamente
- Em 1024px+:
  - layout desktop continua limpo
- Validação técnica:
  - rodar `npx tsc --noEmit`

## 11) Quando Ajustar Componente Base vs Tela

- Ajuste no componente base (`Button`, `Input`, `Select`, `Tabs`) quando:
  - problema se repete em várias telas.
- Ajuste local na tela quando:
  - é um caso específico de fluxo/negócio.

## 12) Regra de Ouro

Se uma nova tela não seguir este guia, ela deve ser considerada incompleta até alinhar padrões de:

- responsividade
- toque
- foco visual
- consistência de layout
