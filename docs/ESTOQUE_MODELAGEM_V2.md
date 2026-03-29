# Estoque V2 - Modelagem Profissional Normalizada

## Objetivo
Evoluir o estoque para um modelo normalizado, escalavel e orientado a manutencao:
- evitar repeticao de dados no cadastro de produtos
- acelerar filtros e relatorios
- separar catalogo, saldo, reserva e movimentacao
- preparar para multiplas filiais

## Visao Geral (Camadas de Dados)
1. `catalog_*`: cadastro mestre (marca, medida, tipo, modelo).
2. `products_v2`: produto comercial (SKU, nome exibicao, status).
3. `inventory_balances`: saldo por filial e produto.
4. `inventory_reservations`: reservas operacionais.
5. `inventory_movements`: trilha completa de movimentacoes.

## Tabelas Principais

### 1) `branches`
Representa filiais/depositos.
- `id` PK
- `code` UNIQUE (ex.: MATRIZ, FILIAL-01)
- `name`
- `is_active`
- `created_at`, `updated_at`

Indices:
- `uk_branches_code (code)`
- `idx_branches_active (is_active)`

### 2) `catalog_brands`
Cadastro de marcas.
- `id` PK
- `name` UNIQUE
- `is_active`
- `created_at`, `updated_at`

Indice:
- `uk_catalog_brands_name (name)`

### 3) `catalog_measures`
Cadastro de medidas.
- `id` PK
- `code` UNIQUE (ex.: QUEEN, KING, M50X70)
- `description`
- `width_cm`, `length_cm`, `height_cm` (opcional)
- `is_active`

Indices:
- `uk_catalog_measures_code (code)`
- `idx_catalog_measures_dims (width_cm, length_cm, height_cm)`

### 4) `catalog_product_types`
Tipo de produto.
- `id` PK
- `code` UNIQUE (COLCHAO, TRAVESSEIRO, BOX, ACESSORIO)
- `name`
- `is_active`

Indice:
- `uk_catalog_product_types_code (code)`

### 5) `catalog_models`
Modelo/linha comercial.
- `id` PK
- `brand_id` FK -> `catalog_brands.id`
- `product_type_id` FK -> `catalog_product_types.id`
- `name`
- `code` UNIQUE (opcional)
- `is_active`

Constraint anti-duplicidade:
- `uk_catalog_models_brand_type_name (brand_id, product_type_id, name)`

Indices:
- `idx_catalog_models_brand (brand_id)`
- `idx_catalog_models_type (product_type_id)`

### 6) `products_v2`
Produto comercial final para venda.
- `id` PK
- `sku` UNIQUE (gerado automaticamente quando nao informado)
- `name` (display)
- `brand_id` FK
- `measure_id` FK
- `product_type_id` FK
- `model_id` FK
- `is_sellable` (ativo para venda)
- `is_archived` (arquivado)
- `inactivation_reason`
- `archive_reason`
- `cost_price`, `sale_price`
- `created_at`, `updated_at`

Constraint anti-duplicidade (produto repetido):
- `uk_products_v2_catalog_key (brand_id, measure_id, product_type_id, model_id)`

Indices:
- `uk_products_v2_sku (sku)`
- `idx_products_v2_sellable_archived (is_sellable, is_archived)`
- `idx_products_v2_brand_measure (brand_id, measure_id)`
- `idx_products_v2_type_model (product_type_id, model_id)`
- `idx_products_v2_name (name)`

### 7) `inventory_balances`
Saldo por produto x filial.
- `id` PK
- `branch_id` FK
- `product_id` FK
- `on_hand` (saldo fisico)
- `reserved` (saldo reservado)
- `available` (gerado: `on_hand - reserved`)
- `minimum_stock`
- `updated_at`

Constraint:
- `uk_inventory_balances_branch_product (branch_id, product_id)` (1 saldo por produto/filial)

Indices:
- `idx_inventory_balances_product (product_id)`
- `idx_inventory_balances_branch (branch_id)`
- `idx_inventory_balances_low_stock (branch_id, available, minimum_stock)`

### 8) `inventory_reservations`
Reservas para pedido/fluxo operacional.
- `id` PK
- `branch_id` FK
- `product_id` FK
- `reference_type` (SALE, ORDER, TRANSFER, MANUAL)
- `reference_id`
- `quantity`
- `status` (OPEN, RELEASED, CONSUMED, CANCELLED)
- `notes`
- `created_by`, `created_at`, `updated_at`

Indices:
- `idx_inventory_reservations_lookup (branch_id, product_id, status)`
- `idx_inventory_reservations_reference (reference_type, reference_id)`

### 9) `inventory_movements`
Livro razao do estoque (imutavel).
- `id` PK
- `branch_id` FK
- `product_id` FK
- `movement_type` (IN, OUT, ADJUSTMENT, TRANSFER_IN, TRANSFER_OUT, RESERVE, RELEASE)
- `quantity`
- `quantity_before`
- `quantity_after`
- `reserved_before`
- `reserved_after`
- `reference_type`, `reference_id`
- `reason`
- `performed_by`
- `created_at`

Indices:
- `idx_inventory_movements_product_date (product_id, created_at DESC)`
- `idx_inventory_movements_branch_date (branch_id, created_at DESC)`
- `idx_inventory_movements_reference (reference_type, reference_id)`

## Regras de Negocio Recomendadas
1. Produto arquivado nao pode vender.
2. Produto inativo nao pode vender.
3. Toda alteracao de saldo gera movimento.
4. Reserva nao altera `on_hand`, altera `reserved`.
5. Saida de venda consome disponivel (`available`), nao apenas `on_hand`.
6. `available` nunca pode ficar negativo por acidente (validar em transacao).

## Fluxo Ideal de Cadastro
1. Cadastrar marca (`catalog_brands`).
2. Cadastrar tipo (`catalog_product_types`).
3. Cadastrar modelo (`catalog_models`) ligado a marca e tipo.
4. Cadastrar medida (`catalog_measures`).
5. Criar produto (`products_v2`) selecionando marca + tipo + modelo + medida.
6. Criar saldo inicial por filial (`inventory_balances`) e movimento inicial em `inventory_movements`.

## Fluxo de Venda (ideal)
1. Buscar saldo de `inventory_balances` por `branch_id` + `product_id`.
2. Validar `is_sellable = true` e `is_archived = false`.
3. Criar reserva (opcional para carrinho/pedido).
4. Confirmar venda:
   - baixa `on_hand`
   - baixa `reserved` (se houver)
   - grava `inventory_movements` com before/after

## Filtros Rapidos Recomendados
Para tela de produtos:
- por marca (`brand_id`)
- por medida (`measure_id`)
- por tipo (`product_type_id`)
- por modelo (`model_id`)
- por status (`is_sellable`, `is_archived`)
- por SKU/prefixo SKU

## Performance e Escala
1. Paginar por cursor para tabelas grandes de movimentacao.
2. Criar visao/materializacao para dashboard de baixo estoque.
3. Particionar `inventory_movements` por data quando volume crescer.
4. Cache de catlogos (`catalog_*`) em memoria.

## Plano de Migracao sem quebra
1. Criar tabelas v2 em paralelo.
2. Backfill do legado (`products`, `movimentacoes`) para v2.
3. Rodar dupla escrita temporaria (legado + v2).
4. Validar consistencia por reconciliacao.
5. Migrar leituras para v2.
6. Desligar legado gradualmente.

## Execucao Pratica (ordem recomendada)
1. Criar estrutura v2:
   - `npm run sql:v2:normalize`
2. Migrar dados legados:
   - `npm run sql:v2:backfill`
3. Conferir consistencia:
   - `npm run sql:v2:check`

Atalho:
- `npm run sql:v2:all`

Diagnostico rapido de banco:
- `npm run db:check`
- `npm run db:start` (tentativa automatica em ambiente local)

## Ativacao segura no backend (fase 4)
1. Habilitar espelhamento:
   - `STOCK_V2_DUAL_WRITE=true`
2. Comecar em validacao sem risco:
   - `STOCK_V2_READ_MODE=shadow`
3. Reiniciar backend e monitorar logs:
   - divergencias de dashboard: `[DashboardStats][Shadow]`
   - divergencias de listagem de produtos: `[Products.list][Shadow]`
4. Somente apos estabilidade, avaliar `STOCK_V2_READ_MODE=v2`.

## Criterio de Go/No-Go para virar leitura para V2
- `legacy_products_without_v2 = 0`
- `legacy_movements_missing_in_v2 = 0`
- sem divergencias relevantes na consulta de saldo legado vs v2
- sem duplicados em `products_v2` por chave catalogo

Se algum criterio falhar, corrigir dados de catalogo (marca/medida/tipo/modelo) e reexecutar backfill.

## Resultado
Com essa estrutura:
- reduz duplicidade de dados
- melhora governanca e rastreabilidade
- acelera filtros e relatorios
- prepara para multi-filial e crescimento
