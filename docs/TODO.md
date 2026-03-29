# Estoque Manager - TODO

## Funcionalidades Principais

### Autenticação e Usuários
- [x] Sistema de autenticação com login único compartilhado para funcionários
- [x] Integração OAuth

### Banco de Dados
- [x] Criar tabela de produtos (nome, medida, categoria, quantidade)
- [x] Criar tabela de movimentações de estoque (entradas/saídas)
- [x] Criar tabela de vendas diárias
- [x] Configurar relacionamentos entre tabelas

### Backend (APIs)
- [x] API para listar produtos com filtros
- [x] API para criar produto
- [x] API para editar produto
- [x] API para excluir produto
- [x] API para buscar produto por nome
- [x] API para registrar venda do dia
- [x] API para listar histórico de movimentações
- [x] API para obter estatísticas do dashboard
- [x] API para exportar relatório em PDF
- [x] API para exportar relatório em Excel
- [x] Sistema de notificações quando estoque atingir 1 ou 3 unidades

### Frontend
- [x] Escolher paleta de cores elegante e configurar tema
- [x] Criar layout com DashboardLayout e navegação
- [x] Página de Dashboard com indicadores visuais
- [x] Página de listagem de produtos com tabela
- [x] Formulário para adicionar produto
- [x] Formulário para editar produto
- [x] Confirmação para excluir produto
- [x] Sistema de busca e filtros (nome, medida, categoria)
- [x] Página de registro de vendas do dia
- [x] Página de histórico de movimentações
- [x] Botões de exportação (PDF e Excel)
- [x] Indicadores visuais para produtos com estoque baixo

### Testes
- [x] Testes unitários para APIs principais
- [x] Testes de integração para fluxo de vendas

### Documentação
- [ ] Instruções de uso para o usuário

## Novas Funcionalidades Solicitadas

### Logo da Empresa
- [x] Adicionar logo da Apioneira Colchões no sidebar
- [x] Adicionar logo nos relatórios PDF

### Relatórios Avançados
- [x] Implementar API para calcular produtos mais vendidos do mês
- [x] Adicionar seção de produtos mais vendidos no Dashboard
- [x] Incluir produtos mais vendidos nos relatórios exportados

### Sistema de Permissões
- [x] Diferenciar permissões entre admin e funcionários
- [x] Admin: acesso total (criar, editar, excluir produtos)
- [x] Funcionários: apenas visualizar produtos e registrar vendas
- [x] Atualizar interface para mostrar/ocultar botões baseado na role
- [x] Adicionar indicador visual da role do usuário logado

## Novas Funcionalidades - Fase 2

### Sistema de Permissões Avançado
- [x] Adicionar role "gerente" ao schema do banco
- [x] Atualizar lógica de permissões para 3 níveis (admin/gerente/vendedor)
- [x] Gerente pode gerenciar produtos mas não vê preços/margens

### Página Pública de Vendas
- [x] Criar página /vendedor acessível sem login
- [x] Listar produtos com quantidades disponíveis
- [x] Permitir registro de vendas sem autenticação
- [x] Interface simplificada para vendedores

### Preços e Margens
- [x] Adicionar campos precoCusto e precoVenda na tabela produtos
- [x] Criar histórico de alterações de preços
- [x] Calcular margem de lucro automaticamente
- [x] Exibir preços/margens apenas para admin

### Gráficos de Vendas
- [x] Gráfico de evolução de vendas ao longo do tempo
- [x] Gráfico de vendas por categoria
- [x] Gráfico de vendas por medida
- [x] Integrar gráficos no Dashboard

### Alertas de Reposição
- [x] Calcular sugestões de reposição baseado em vendas
- [x] Gerar lista de compras otimizada
- [x] Exibir alertas no Dashboard

## Correções de Bugs

- [x] Corrigir erro no componente Select da página de Produtos (SelectItem com value vazio)

## Correção OAuth Mobile

- [x] Investigar problema de loop de redirecionamento no OAuth mobile
- [x] Ajustar configurações de cookies para compatibilidade mobile (sameSite: lax)
- [x] Testar autenticação em navegadores mobile (Safari iOS, Chrome Android)

## Importação de Produtos

- [x] Extrair dados da planilha Queen (158x198) com 40 produtos
- [x] Criar script de importação em lote (SQL)
- [x] Executar importação no banco de dados
- [x] Verificar se todos os produtos foram importados corretamente (46 produtos Queen no total)

## Melhorias de Interface

- [x] Adicionar campo "Marca" ao schema de produtos
- [x] Atualizar APIs para incluir marca
- [x] Atualizar formulários de produtos para incluir campo marca
- [x] Atualizar listagem de produtos para exibir marca
- [x] Ocultar coluna "Estoque Mínimo" para vendedores (visível apenas admin/gerente)
- [x] Atualizar marcas dos 40 produtos Queen importados

## Alteração de Tema Visual

- [x] Copiar imagem da nuvem PNG para o projeto
- [x] Alterar paleta de cores: azul marinho → azul bebê, laranja → azul turquesa
- [x] Adicionar nuvem como elemento decorativo no layout
- [x] Testar visual em todas as páginas

## Ajuste de Logo

- [x] Remover logo com fundo branco do sidebar
- [x] Manter apenas nuvem azul como elemento visual

## Melhorias de Usabilidade

- [x] Adicionar campo de busca na página de registro de vendas para filtrar produtos por nome ou marca

## Sistema de Vendas por Encomenda

- [x] Remover bloqueio de estoque insuficiente na página de vendas (admin/gerente)
- [x] Remover bloqueio de estoque insuficiente na página pública de vendas (/vendedor)
- [x] Adicionar alerta informativo quando vender produto com estoque zero ou negativo
- [x] Adicionar badge "X encomendadas" para produtos com estoque negativo
- [x] Atualizar indicadores visuais nas listagens de produtos (cor diferente para estoque negativo)
- [x] Atualizar dashboard para mostrar produtos encomendados
- [x] Atualizar relatórios para incluir informações de encomendas

## Identidade Visual

- [x] Atualizar logo/ícone para usar a mesma imagem da nuvem da Tabela de Preços Interativa
- [x] Aumentar tamanho do logo da nuvem para melhor proporção visual
- [x] Adicionar texto "Estoque Pioneira Colchões" ao lado do logo da nuvem
- [x] Atualizar imagem da nuvem para versão branca minimalista

## Bugs Críticos

- [x] Corrigir erro NotFoundError removeChild que causa queda da página ao interagir (otimização de build)
- [x] Aumentar tamanho do texto "ESTOQUE" no logo do sidebar

## Importação de Produtos Solteiro

- [x] Extrair dados da planilha de produtos Solteiro
- [x] Criar script de importação SQL
- [x] Executar importação no banco de dados
- [x] Verificar se todos os produtos foram importados corretamente (17 produtos)

## Importação de Produtos Espuma (Solteiro 0,78 e 0,88)

- [x] Extrair dados da planilha de produtos de espuma
- [x] Criar script de importação SQL com largura no nome do produto
- [x] Executar importação no banco de dados
- [x] Verificar se todos os produtos foram importados corretamente (17 produtos espuma + 17 anteriores = 34 total)

## Importação de Produtos Solteirão (108 x 198)

- [x] Extrair dados da planilha de produtos Solteirão
- [x] Criar script de importação SQL
- [x] Executar importação no banco de dados
- [x] Verificar se todos os produtos foram importados corretamente (13 produtos)

## Importação de Produtos Casal (138 x 188) e SAPPHIRE (128 x 188)

- [x] Extrair dados das planilhas de produtos Casal (espumas e colchões)
- [x] Criar script de importação SQL
- [x] Executar importação no banco de dados
- [x] Verificar se todos os produtos foram importados corretamente (33 produtos)

## Importação de Produtos King (193 x 203)

- [x] Extrair dados da planilha de produtos King
- [x] Criar script de importação SQL
- [x] Executar importação no banco de dados
- [x] Verificar se todos os produtos foram importados corretamente (24 produtos)

## Suporte a Medidas Personalizadas (Travesseiros e Acessórios)

- [x] Analisar schema atual do campo medida (enum fixo)
- [x] Modificar schema para aceitar medidas personalizadas além das 5 fixas (varchar 100)
- [x] Atualizar formulário de criação de produtos para permitir input customizado com datalist
- [x] Atualizar formulário de edição de produtos
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Testar cadastro de travesseiro 50x70 pelo usuário (testes unitários passando)

## Cadastro de Travesseiros

- [x] Adicionar 40 travesseiros NAZA FLEX 65x45 marca LAMOUR
- [x] Atualizar estoque RELAX DREAM 50x70 para 46 unidades marca LAMOUR

## Alteração de Estoque Mínimo Padrão

- [x] Alterar valor padrão de estoqueMinimo de 3 para 1 nos formulários (4 ocorrências)
- [x] Verificar procedures tRPC (não necessita alteração)
- [x] Testar interface atualizada (HMR aplicado com sucesso)

## Controle de Visibilidade de Alertas de Estoque

- [x] Identificar componentes que exibem alertas de estoque baixo (Dashboard, Produtos)
- [x] Adicionar verificação de role (admin/gerente) para exibir alertas
- [x] Ocultar card "Estoque Baixo" no Dashboard para vendedores
- [x] Ocultar seção "Produtos com Estoque Baixo" no Dashboard para vendedores
- [x] Ocultar ícones de alerta na listagem de produtos para vendedores
- [x] Testar interface atualizada (HMR aplicado com sucesso)

## Atualização de Estoque Mínimo e Medidas

- [x] Atualizar estoque mínimo de todos os produtos existentes de 3 para 1 (UPDATE executado)
- [x] Verificar visibilidade do ícone ⚠️ (já configurado para admin/gerente apenas)
- [x] Adicionar novas medidas ao datalist: Super King, 50x70, 45x65, 70x130, 70x150, 60x130, 30x50, Medida Especial (13 medidas totais)

## Correção de Validação de Medida e Categoria Acessórios

- [x] Identificar validação enum de medida no backend (routers.ts)
- [x] Remover validação enum fixa e aceitar string livre para medida (z.string())
- [x] Adicionar categoria "Acessórios" ao schema, routers e frontend
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Verificar compilação TypeScript (sem erros)

## Correção de Re-renderização no Campo de Busca

- [x] Investigar código do campo de busca em Products.tsx
- [x] Identificar referências instáveis causando loop de re-renderização (objeto criado a cada render)
- [x] Estabilizar referências com useMemo para queryParams
- [x] Verificar compilação e HMR (sem erros)

## Identificação de Vendedor nas Vendas

- [x] Adicionar campo "vendedor" (varchar 100) na tabela vendas no schema
- [x] Executar migração do banco de dados (0006_good_justice.sql)
- [x] Adicionar lista de vendedores (Cleonice, Luciano, Vanuza) no frontend
- [x] Atualizar procedure de criação de venda para incluir vendedor
- [x] Adicionar campo de seleção de vendedor no formulário de vendas
- [x] Validação obrigatória de vendedor antes de confirmar venda
- [x] Verificar compilação TypeScript (sem erros)

## Reposicionamento de Campo Vendedor e Adição de Thuanny

- [x] Adicionar "Thuanny" à lista de vendedores (VENDEDORES array - 4 vendedores)
- [x] Mover campo de seleção de vendedor para o topo da página (primeiro campo do card)
- [x] Verificar compilação TypeScript (sem erros)

## Unificação de Campos de Busca e Seleção de Produto

- [x] Remover campo separado "Buscar Produto"
- [x] Unificar em um único bloco com busca + select integrados
- [x] Implementar filtro em tempo real ao digitar
- [x] Verificar compilação TypeScript (sem erros)

## Gestão de Preços e Margens (Admin Only)

- [x] Campos precoCusto e precoVenda já existiam no schema
- [x] Criar página "Preços e Margens" com listagem e edição
- [x] Calcular margem de lucro automaticamente (%)
- [x] Adicionar rota /precos-margens no App.tsx
- [x] Adicionar link no menu lateral (admin only)

## Relatórios de Desempenho da Equipe

- [ ] Criar query para vendas por vendedor (quantidade e valor total)
- [ ] Implementar ranking de vendedores do período
- [ ] Criar página de relatórios com gráficos
- [ ] Adicionar filtros por período (dia, semana, mês, ano)
- [ ] Mostrar produtos mais vendidos por vendedor
- [ ] Gráfico de evolução de vendas por vendedor

## Paginação do Histórico

- [x] Criar procedure getVendasPaginated com offset/limit
- [x] Implementar paginação no frontend (20 registros por página)
- [x] Adicionar botões Anterior/Próximo
- [x] Mostrar total de páginas e registros
- [x] Reorganizar History.tsx com tabs (Vendas e Movimentações)

## Cancelamento de Vendas

- [x] Adicionar campos status e motivoCancelamento na tabela vendas
- [x] Executar migração do banco de dados (0007_lucky_zarda.sql)
- [x] Criar procedure cancelarVenda (restaura estoque automaticamente)
- [x] Adicionar botão "Cancelar Venda" no histórico (admin/gerente only)
- [x] Modal de confirmação com campo obrigatório de motivo
- [x] Registrar movimentação de cancelamento com observação

## Otimização do Dashboard

- [x] Ocultar card "Sugestões de Reposição Automática" para vendedores (admin/gerente only)
- [x] Dashboard já possui gráficos de vendas e top produtos
- [x] Layout já prioriza informações de vendas

## Verificação do Dashboard

- [ ] Verificar se Dashboard já mostra vendas, ranking de produtos e gráficos
- [ ] Confirmar que sugestões de reposição estão visíveis apenas para admin/gerente
- [ ] Confirmar que layout está correto

## Melhorias de UX no Dashboard e Vendas

- [x] Adicionar campo "observacoes" (text) na tabela vendas
- [x] Executar migração do banco de dados (0008_violet_the_order.sql)
- [x] Dashboard: Sugestões de reposição aparecem apenas ao clicar em "Estoque Baixo" (modal)
- [x] Dashboard: Card "Encomendas" ao clicar mostra produtos com estoque negativo (modal)
- [x] Adicionar campo "Observações" no formulário de vendas
- [x] Backend: Atualizar procedure registrar para aceitar observacoes
- [x] Backend: Criar procedure negativeStock para produtos com estoque negativo
- [x] Histórico: Adicionar botões "Editar", "Cancelar" e "Excluir" na coluna Ações (admin only)
- [ ] Implementar funcionalidade completa de Editar venda
- [ ] Implementar funcionalidade completa de Excluir venda

## Adicionar Categoria Bicamas

- [x] Adicionar "Bicamas" ao enum de categoria no schema
- [x] Executar migração do banco de dados (0009_broken_ikaris.sql)
- [x] Adicionar "Bicamas" ao array CATEGORIAS no frontend (Products.tsx)

## Correção de Validação de Categoria Bicamas

- [x] Atualizar validação de categoria no routers.ts para incluir "Bicamas" (create e update)
- [x] Verificar compilação TypeScript (sem erros)

## Implementação de Edição de Vendas

- [x] Criar procedure editarVenda no backend (routers.ts e db.ts)
- [x] Implementar lógica de ajuste de estoque (restaurar estoque antigo, aplicar novo)
- [x] Adicionar estados e mutation de edição no frontend (History.tsx)
- [x] Criar modal de edição completo no frontend
- [x] Testar edição de venda e verificar ajuste correto de estoque

## Permitir Vendas com Estoque Negativo (Encomendas)

- [x] Remover validação de estoque insuficiente nas procedures de venda
- [x] Permitir estoque negativo para registrar encomendas
- [x] Testar venda de produto sem estoque
- [x] Criar testes unitários para vendas com estoque negativo (5/5 passando)

## Campo Nome do Cliente e Relatórios

- [x] Adicionar campo nomeCliente à tabela vendas no schema
- [x] Executar migração do banco de dados
- [x] Adicionar campo "Nome do Cliente" no formulário de vendas (Sales.tsx)
- [x] Atualizar procedure vendas.registrar para aceitar nomeCliente
- [x] Criar página de Relatório de Vendas com filtros (data, vendedor, cliente)
- [x] Implementar procedures backend para relatório de vendas
- [x] Criar página de Relatório de Encomendas
- [x] Incluir no relatório de encomendas: produto, quantidade, cliente, marca, observações
- [x] Implementar procedures backend para relatório de encomendas
- [x] Adicionar links de navegação para os novos relatórios
- [x] Testar todos os fluxos de relatórios no navegador
- [ ] Implementar exportação real de relatório de vendas (PDF/Excel) - atualmente retorna placeholder
- [ ] Implementar exportação real de relatório de encomendas (PDF/Excel) - atualmente retorna placeholder

## Implementar Exclusão de Vendas

- [x] Verificar se a procedure de exclusão existe no backend
- [x] Implementar lógica de exclusão com restauração de estoque
- [x] Conectar botão de exclusão no frontend (History.tsx)
- [x] Testar exclusão de venda e verificar restauração de estoque
- [x] Funcionalidade testada e funcionando no navegador

## Corrigir Exclusão de Vendas com Produtos Deletados

- [x] Modificar função excluirVenda para não falhar quando produto não existe
- [x] Permitir exclusão da venda mesmo sem restaurar estoque
- [x] Testar exclusão de vendas teste com "Produto não encontrado"
- [x] Funcionalidade testada e funcionando no navegador

## Correção de Página Piscando ao Digitar no Campo de Busca

- [x] Identificar formulário que está causando recarregamento da página (não há formulário)
- [x] Adicionar stopPropagation no onKeyDown do campo de busca
- [x] Testar digitação no campo de busca
- [ ] Problema parcialmente resolvido - algumas letras ainda apresentam comportamento intermitente
- [ ] Investigar possível conflito com navegador ou ambiente de desenvolvimento

## Dashboard de Rankings

- [x] Criar procedure para ranking de vendedores (total de vendas, quantidade vendida)
- [x] Criar procedure para ranking de produtos mais vendidos
- [x] Criar página Rankings.tsx com tabelas e gráficos
- [x] Implementar ranking de vendedores com total de vendas e quantidade
- [x] Implementar ranking de produtos mais vendidos com quantidade e valor
- [x] Adicionar filtro de período (mês atual, últimos 30 dias, personalizado)
- [x] Adicionar barras de progresso coloridas para visualização
- [x] Adicionar rota /rankings no App.tsx
- [x] Adicionar link "Rankings" no menu lateral do DashboardLayout
- [x] Testar rankings no navegador - funcionando perfeitamente
- [ ] Criar testes unitários para as procedures de ranking

## Corrigir Problema do Ranking Não Aparecer

- [x] Investigar por que o ranking não está aparecendo para o usuário
- [x] Verificar logs de erro no console do navegador
- [x] Verificar se as procedures estão retornando dados
- [x] Ranking está funcionando corretamente - sem problemas identificados

## Implementar Exportação Real de Relatórios

- [x] Instalar biblioteca exceljs para geração de Excel
- [x] Criar helper excelExport.ts com funções de geração
- [x] Implementar exportação de relatório de vendas em Excel
- [x] Implementar exportação de relatório de encomendas em Excel
- [x] Atualizar procedures no routers.ts para usar funções reais
- [x] Testar exportação de vendas no navegador - funcionando
- [x] Testar exportação de encomendas no navegador - funcionando
- [x] Arquivos Excel com formatação profissional e upload para S3

## Aumentar Tamanho da Nuvem (Logo)

- [x] Localizar onde está o ícone da nuvem no DashboardLayout
- [x] Aumentar o tamanho em 50% (de h-12 para h-18)
- [x] Testar no navegador - nuvem agora está visivelmente maior

## Aumentar Nuvem Mais 50% (Segunda Iteração)

- [x] Aumentar nuvem de h-18 para h-27 (mais 50%)
- [x] Testar no navegador - nuvem agora está 2.25x maior que o tamanho original

## Exportação de Relatório PDF de Produtos Selecionados

- [ ] Adicionar checkboxes para seleção de produtos na tabela
- [ ] Adicionar estado para gerenciar produtos selecionados
- [ ] Instalar biblioteca para geração de PDF (pdfkit ou similar)
- [ ] Criar procedure backend para gerar PDF de produtos selecionados
- [ ] Adicionar botão "Exportar PDF" na página de Produtos
- [ ] Conectar botão ao backend e fazer download do PDF
- [ ] Testar seleção e exportação no navegador

## Exportação de Relatório PDF de Produtos Selecionados

- [x] Adicionar checkboxes de seleção na tabela de produtos
- [x] Adicionar botão "Exportar PDF" que aparece quando produtos estão selecionados
- [x] Criar procedure backend exportPDF no router products
- [x] Criar função getProductsByIds no db.ts
- [x] Criar helper pdfExport.ts para geração de PDF com pdfkit
- [x] Testar seleção de 3 produtos e exportação PDF - funcionando perfeitamente
- [x] PDF gerado com formatação profissional e upload para S3

## Modificar Exportação PDF para Usar Filtros (Admin Only)

- [x] Remover checkboxes de seleção individual da tabela de produtos
- [x] Modificar botão "Exportar PDF" para usar filtros aplicados (nome, medida, categoria)
- [x] Restringir visibilidade do botão apenas para administradores (role === 'admin')
- [x] Atualizar procedure backend exportPDF para aceitar filtros ao invés de productIds
- [x] Criar função getProductsFiltered no db.ts
- [x] Adicionar verificação de role admin na procedure backend
- [x] Testar exportação com filtro de busca ("W") - 12 produtos exportados
- [x] Funcionalidade testada e funcionando perfeitamente

## Corrigir Download Automático de PDF

- [x] Modificar handleExportPDF no Products.tsx para fazer download automático
- [x] Criar elemento <a> temporário com download attribute
- [x] Testar download automático no navegador
- [x] Problema: PDF não abre em nova aba nem faz download (cross-origin)
- [x] Implementar download via fetch + blob para funcionar corretamente
- [x] PDF agora baixa automaticamente (produtos-1770150496435.pdf)

## Corrigir Campo de Quantidade na Página de Vendas

- [x] Investigar por que não é possível digitar mais de um dígito no campo quantidade
- [x] Identificado: parseInt("0") || 1 estava voltando para 1 ao digitar segundo dígito
- [x] Corrigir o problema para permitir digitação de múltiplos dígitos (ex: 02, 10, 100)
- [x] Testar digitação de diferentes quantidades no navegador - funcionando (testado: 12)
- [x] Campo agora aceita digitação de múltiplos dígitos corretamente

## Adicionar Botões de Controle de Quantidade na Página de Vendas

- [x] Adicionar botões + e - ao lado do campo de quantidade
- [x] Implementar funcionalidade de incrementar/decrementar quantidade
- [x] Estilizar botões para ficarem visíveis e fáceis de usar
- [x] Testar controles de quantidade no navegador

## Adicionar Categoria CAMAS

- [x] Atualizar schema do banco de dados para incluir "CAMAS" no enum de categoria
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Adicionar "CAMAS" ao array CATEGORIAS no frontend (Products.tsx)
- [x] Atualizar validação de categoria no routers.ts para incluir "CAMAS"
- [x] Testar criação de produto com categoria CAMAS no navegador

## Adicionar Filtro de Marca e Corrigir Problema de Busca

- [x] Investigar e corrigir problema de "piscar" ao digitar na busca (re-renderizações)
- [x] Adicionar parâmetro de filtro por marca no backend (server/routers.ts)
- [x] Adicionar select de filtro por marca no frontend (Products.tsx)
- [x] Obter lista de marcas únicas do banco de dados
- [x] Testar filtro de marca e busca sem "piscar" no navegador

## Investigar e Corrigir Problema de Piscar na Busca (Relatado pelo Usuário)

- [x] Verificar logs do navegador (browserConsole.log) para identificar erros
- [x] Testar busca digitando letra por letra e reproduzir o problema
- [x] Identificar causa raiz (re-renderização, perda de foco, erro de estado)
- [x] Implementar correção definitiva
- [x] Validar que a busca funciona sem piscar ou "cair"

## Corrigir Perda de Foco no Campo de Busca (Problema Persistente)

- [x] Investigar causa da perda de foco após digitar letra
- [x] Analisar re-renderizações do componente Products
- [x] Implementar useRef para manter referência do input
- [x] Adicionar autoFocus condicional após re-renderização
- [x] Testar busca letra por letra sem perder foco

## Adicionar Tipo de Transação nas Vendas

- [x] Adicionar campo tipoTransacao no schema de vendas (enum: venda, troca, brinde, empréstimo)
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Atualizar routers.ts para incluir tipoTransacao na criação de vendas
- [x] Adicionar select de tipo de transação no frontend (PublicSales.tsx)
- [ ] Atualizar relatórios para mostrar tipo de transação
- [x] Testar criação de venda com cada tipo de transação

## Adicionar PERMUTA ao Tipo de Transação

- [x] Adicionar "permuta" ao enum tipoTransacao no schema de vendas
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Atualizar validação no routers.ts para incluir "permuta"
- [x] Adicionar opção "Permuta" no select do frontend (PublicSales.tsx)
- [x] Testar criação de venda com tipo PERMUTA

## Corrigir Interrupção Persistente na Busca de Produtos

- [x] Investigar por que useRef não resolveu completamente o problema
- [x] Testar abordagem alternativa: controlled input sem debounce no valor
- [x] Implementar debounce apenas na query, não no input
- [x] Testar digitação fluida sem interrupções

## Adicionar Tipo de Transação na Página Interna de Vendas

- [x] Adicionar campo tipoTransacao na página Sales.tsx (registro interno)
- [x] Atualizar mutation de registro de vendas internas para incluir tipoTransacao
- [x] Testar registro de venda interna com tipo de transação

## Adicionar Edição de Tipo de Transação no Histórico

- [x] Localizar modal de edição de vendas no histórico
- [x] Adicionar campo select de tipo de transação no modal
- [x] Atualizar procedure de edição no backend para incluir tipoTransacao
- [x] Testar edição de tipo de transação no histórico de vendas

## Verificar Campo Tipo de Transação no Modal de Edição

- [x] Verificar se o código do campo tipo de transação está presente no History.tsx
- [x] Limpar cache do navegador e reiniciar servidor
- [x] Testar modal de edição novamente
- [x] Confirmar que campo aparece corretamente

## Adicionar Coluna de Tipo na Tabela do Histórico

- [x] Adicionar coluna "Tipo" na tabela de vendas do histórico
- [x] Exibir tipo de transação (venda/troca/brinde/empréstimo/permuta) em cada linha
- [x] Ajustar layout da tabela para acomodar nova coluna

## Implementar Filtro por Tipo de Transação

- [x] Adicionar select de filtro por tipo no histórico
- [x] Atualizar backend para aceitar filtro de tipo na query
- [x] Aplicar filtro na listagem de vendas
- [x] Testar filtro com diferentes tipos de transação

## Corrigir Card de Movimentações no Dashboard

- [x] Investigar código do card de Movimentações no Dashboard.tsx
- [x] Verificar query/procedure getDashboardStats que fornece dados
- [x] Corrigir lógica de contagem de movimentações nas últimas 24 horas
- [x] Testar card no navegador para confirmar atualização

## Adicionar Produtos Personalizados em Encomendas

- [x] Atualizar schema de encomendas para incluir campos de produto personalizado (nomeProduto, medidaProduto)
- [x] Adicionar campo dataEntrega no schema de encomendas
- [x] Tornar productId opcional quando produto personalizado for usado
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Atualizar backend para aceitar produtos personalizados
- [x] Adicionar toggle no frontend para escolher entre produto cadastrado ou personalizado
- [x] Adicionar campos de nome e medida customizados quando personalizado
- [x] Adicionar campo de data de entrega (padrão: +15 dias úteis)

## Implementar Alertas de Prazo de Entrega

- [x] Criar lógica de cálculo de dias úteis restantes
- [x] Adicionar badges coloridos por status (verde: >3 dias, amarelo: 1-3 dias, vermelho: vencido)
- [x] Exibir alertas visuais na tabela de encomendas
- [x] Testar criação de encomenda personalizada
- [x] Testar alertas com diferentes datas de entrega

## Adicionar Data da Compra e Status Pedido Feito em Encomendas

- [x] Adicionar campo dataCompra no schema de encomendas
- [x] Adicionar campo pedidoFeito (boolean) no schema de encomendas
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Atualizar backend para calcular dataEntrega baseado em dataCompra (+15 dias úteis)
- [x] Adicionar campo de data da compra no formulário de criação
- [x] Adicionar checkbox "Pedido Feito" na tabela de encomendas
- [x] Adicionar indicador visual (badge/ícone) quando pedido foi feito
- [x] Testar criação de encomenda com data da compra
- [x] Testar marcação de pedido feito

## Adicionar Prazo Variável nas Encomendas

- [x] Adicionar campo prazoEntregaDias (número de dias úteis) no schema de encomendas
- [x] Executar migração do banco de dados (pnpm db:push)
- [x] Atualizar backend para calcular dataEntrega baseado em prazoEntregaDias OU dataCompra
- [x] Adicionar toggle no frontend para escolher entre "Prazo em dias úteis" ou "Data específica"
- [x] Mostrar campo de número (dias úteis) quando prazo for selecionado
- [x] Mostrar campo de data quando data específica for selecionada
- [ ] Testar criação com prazo em dias úteis (ex: 10, 20, 30 dias)
- [ ] Testar criação com data específica

## Melhorias no Relatório de Encomendas

### Busca de Produto por Nome
- [x] Implementar busca/filtro no select de produtos na Nova Encomenda
- [x] Permitir digitar nome do produto para filtrar opções

### Filtro por Nome do Cliente
- [x] Adicionar campo de filtro por nome do cliente no relatório
- [x] Atualizar backend para aceitar filtro de cliente
- [x] Aplicar filtro na listagem de encomendas

### Exportação PDF de Encomendas
- [x] Criar procedure de exportação de encomendas em PDF no backend
- [x] Adicionar botão "Exportar PDF" no relatório de encomendas
- [x] Gerar PDF com lista de encomendas filtradas

### Restrição de Exclusão para Admin
- [x] Verificar role do usuário antes de permitir exclusão
- [x] Ocultar botão de excluir para usuários não-admin
- [x] Adicionar validação no backend para apenas admin excluir

- [ ] Testar busca de produto por nome
- [ ] Testar filtro por cliente
- [ ] Testar exportação PDF
- [ ] Testar restrição de exclusão

## Sistema de Gerenciamento de Marcas (Admin)

### Banco de Dados
- [ ] Criar tabela 'marcas' (id, nome, createdAt, updatedAt)
- [ ] Executar migração do banco de dados (pnpm db:push)
- [ ] Migrar marcas existentes do array hardcoded para a tabela

### Backend
- [ ] Criar procedures tRPC para listar marcas (getAllMarcas)
- [ ] Criar procedure para criar marca (createMarca - admin only)
- [ ] Criar procedure para editar marca (updateMarca - admin only)
- [ ] Criar procedure para excluir marca (deleteMarca - admin only)
- [ ] Validar que marca não está em uso antes de excluir

### Frontend
- [ ] Criar página /marcas para gerenciamento (admin only)
- [ ] Implementar listagem de marcas em tabela
- [ ] Adicionar formulário de criação de marca
- [ ] Implementar edição inline ou modal
- [ ] Implementar exclusão com confirmação
- [ ] Adicionar link no menu lateral (admin only)
- [ ] Atualizar formulários de produtos para buscar marcas do banco

### Testes
- [ ] Testar criação de marca
- [ ] Testar edição de marca
- [ ] Testar exclusão de marca
- [ ] Testar que apenas admin pode gerenciar marcas
- [ ] Verificar que produtos usam marcas do banco

## Sistema de Gerenciamento de Marcas (Admin)

### Banco de Dados
- [ ] Criar tabela 'marcas' (id, nome, createdAt, updatedAt)
- [ ] Executar migração do banco de dados (pnpm db:push)
- [ ] Migrar marcas existentes do array hardcoded para a tabela

### Backend
- [ ] Criar procedures tRPC para listar marcas (getAllMarcas)
- [ ] Criar procedure para criar marca (createMarca - admin only)
- [ ] Criar procedure para editar marca (updateMarca - admin only)
- [ ] Criar procedure para excluir marca (deleteMarca - admin only)
- [ ] Validar que marca não está em uso antes de excluir

### Frontend
- [ ] Criar página /marcas para gerenciamento (admin only)
- [ ] Implementar listagem de marcas em tabela
- [ ] Adicionar formulário de criação de marca
- [ ] Implementar edição inline ou modal
- [ ] Implementar exclusão com confirmação
- [ ] Adicionar link no menu lateral (admin only)
- [ ] Atualizar formulários de produtos para buscar marcas do banco

### Testes
- [ ] Testar criação de marca
- [ ] Testar edição de marca
- [ ] Testar exclusão de marca
- [ ] Testar que apenas admin pode gerenciar marcas
- [ ] Verificar que produtos usam marcas do banco

## Sistema de Gerenciamento de Marcas (Admin)

### Banco de Dados
- [ ] Criar tabela 'marcas' (id, nome, createdAt, updatedAt)
- [ ] Executar migração do banco de dados (pnpm db:push)
- [ ] Migrar marcas existentes do array hardcoded para a tabela

### Backend
- [ ] Criar procedures tRPC para listar marcas (getAllMarcas)
- [ ] Criar procedure para criar marca (createMarca - admin only)
- [ ] Criar procedure para editar marca (updateMarca - admin only)
- [ ] Criar procedure para excluir marca (deleteMarca - admin only)
- [ ] Validar que marca não está em uso antes de excluir

### Frontend
- [ ] Criar página /marcas para gerenciamento (admin only)
- [ ] Implementar listagem de marcas em tabela
- [ ] Adicionar formulário de criação de marca
- [ ] Implementar edição inline ou modal
- [ ] Implementar exclusão com confirmação
- [ ] Adicionar link no menu lateral (admin only)
- [ ] Atualizar formulários de produtos para buscar marcas do banco

### Testes
- [ ] Testar criação de marca
- [ ] Testar edição de marca
- [ ] Testar exclusão de marca
- [ ] Testar que apenas admin pode gerenciar marcas
- [ ] Verificar que produtos usam marcas do banco


## Correção: Marcas Faltantes
- [x] Identificar todas as marcas usadas nos produtos
- [x] Inserir marcas faltantes na tabela de marcas
- [x] Verificar que todas as marcas aparecem nos formulários


## Mesclagem de Marcas: PLUMATEX → PLUMATEX/SEALY
- [x] Atualizar produtos que usam "PLUMATEX " para "PLUMATEX/SEALY"
- [x] Remover marca "PLUMATEX " da tabela de marcas
- [x] Verificar que todos os produtos foram atualizados corretamente

## Correção: Piscar ao digitar no campo de busca
- [ ] Implementar debounce no campo de busca de produtos
- [ ] Separar estado local do input do estado de query (evitar re-render a cada tecla)
- [ ] Verificar outros campos de busca com o mesmo problema

## Correção: Piscar ao digitar no campo de busca
- [x] Implementar debounce no campo de busca de produtos
- [x] Separar estado local do input do estado de query
- [x] Verificar outros campos de busca com o mesmo problema

## Correção: Piscar ao digitar no campo de busca
- [x] Implementar debounce no campo de busca de produtos
- [x] Separar estado local do input do estado de query
- [x] Verificar outros campos de busca com o mesmo problema

## Paginação na Lista de Produtos
- [x] Adicionar suporte a limit/offset/total na procedure products.list
- [x] Atualizar db.ts para retornar total de registros junto com os dados
- [x] Implementar controles de paginação no frontend (anterior/próximo, número de página)
- [x] Manter filtros e busca funcionando com paginação
- [x] Resetar para página 1 ao aplicar filtros

## Correção: Busca de Produtos em Vendas/Encomendas
- [x] Corrigir Sales.tsx para buscar todos os produtos (sem paginação) no seletor
- [x] Corrigir Encomendas.tsx para buscar todos os produtos no seletor
- [x] Corrigir PublicSales.tsx para buscar todos os produtos
- [x] Corrigir History.tsx para ter acesso a todos os produtos

## Correção: Busca com Acentos em Vendas
- [x] Normalizar acentos na busca de produtos em Sales.tsx (ex: "Bau" encontra "Baú")
- [x] Incluir busca por categoria no filtro de produtos

## Correção Definitiva: Busca de Produtos em Vendas
- [x] Identificar causa raiz: pageSize>100 era rejeitado pelo Zod, retornando apenas 25 itens
- [x] Corrigir Sales.tsx para enviar searchTerm ao backend (busca server-side sem limite)
- [x] Adicionar debounce de 300ms para não disparar query a cada tecla
- [x] Mostrar "Buscando..." enquanto aguarda resposta do servidor
