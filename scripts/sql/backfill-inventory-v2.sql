-- Estoque V2 - Backfill do legado (products + movimentacoes) para modelo normalizado.
-- Execute APOS normalize-inventory-v2.sql
-- Idempotente: pode ser reexecutado.

START TRANSACTION;

-- 1) Garantir catalogos base (brand/type/measure/model)

-- Marca: se legado vier nulo/vazio, usar "SEM_MARCA".
INSERT INTO catalog_brands (name)
SELECT DISTINCT
  CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END AS name
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM catalog_brands b
  WHERE b.name = CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END
);

-- Tipo: derivado de categoria legado.
INSERT INTO catalog_product_types (code, name)
SELECT DISTINCT
  UPPER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(p.categoria), ' ', '_'), '-', '_'), 'Ç', 'C'), 'Õ', 'O')) AS code,
  TRIM(p.categoria) AS name
FROM products p
WHERE p.categoria IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM catalog_product_types t
    WHERE t.name = TRIM(p.categoria)
  );

-- Medida: derivada de medida legado.
INSERT INTO catalog_measures (code, description)
SELECT DISTINCT
  UPPER(REPLACE(REPLACE(TRIM(p.medida), ' ', '_'), '-', '_')) AS code,
  TRIM(p.medida) AS description
FROM products p
WHERE p.medida IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM catalog_measures m
    WHERE m.description = TRIM(p.medida)
  );

-- Modelo/Linha: derivado de name + brand + type.
INSERT INTO catalog_models (brand_id, product_type_id, name, code)
SELECT DISTINCT
  b.id,
  t.id,
  TRIM(p.name) AS name,
  NULL
FROM products p
JOIN catalog_brands b
  ON b.name = CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END
JOIN catalog_product_types t
  ON t.name = TRIM(p.categoria)
WHERE NOT EXISTS (
  SELECT 1
  FROM catalog_models cm
  WHERE cm.brand_id = b.id
    AND cm.product_type_id = t.id
    AND cm.name = TRIM(p.name)
);

-- 2) Produtos V2
INSERT IGNORE INTO products_v2 (
  name,
  brand_id,
  measure_id,
  product_type_id,
  model_id,
  is_sellable,
  is_archived,
  inactivation_reason,
  archive_reason,
  cost_price,
  sale_price,
  created_at,
  updated_at
)
SELECT
  TRIM(p.name) AS name,
  b.id AS brand_id,
  m.id AS measure_id,
  t.id AS product_type_id,
  cm.id AS model_id,
  1 AS is_sellable,
  0 AS is_archived,
  NULL AS inactivation_reason,
  NULL AS archive_reason,
  p.precoCusto AS cost_price,
  p.precoVenda AS sale_price,
  COALESCE(p.createdAt, NOW()) AS created_at,
  COALESCE(p.updatedAt, NOW()) AS updated_at
FROM products p
JOIN catalog_brands b
  ON b.name = CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END
JOIN catalog_measures m
  ON m.description = TRIM(p.medida)
JOIN catalog_product_types t
  ON t.name = TRIM(p.categoria)
JOIN catalog_models cm
  ON cm.brand_id = b.id
 AND cm.product_type_id = t.id
 AND cm.name = TRIM(p.name);

-- 2.1) Vinculo estavel legado -> v2 (idempotente)
INSERT INTO legacy_product_links (legacy_product_id, product_v2_id)
SELECT
  p.id AS legacy_product_id,
  pv2.id AS product_v2_id
FROM products p
JOIN catalog_brands b
  ON b.name = CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END
JOIN catalog_measures m
  ON m.description = TRIM(p.medida)
JOIN catalog_product_types t
  ON t.name = TRIM(p.categoria)
JOIN catalog_models cm
  ON cm.brand_id = b.id
 AND cm.product_type_id = t.id
 AND cm.name = TRIM(p.name)
JOIN products_v2 pv2
  ON pv2.brand_id = b.id
 AND pv2.measure_id = m.id
 AND pv2.product_type_id = t.id
 AND pv2.model_id = cm.id
ON DUPLICATE KEY UPDATE
  product_v2_id = VALUES(product_v2_id),
  updated_at = CURRENT_TIMESTAMP;

-- 3) Saldo inicial por filial (MATRIZ)
INSERT INTO inventory_balances (branch_id, product_id, on_hand, reserved, minimum_stock, updated_at)
SELECT
  br.id AS branch_id,
  pv2.id AS product_id,
  MAX(p.quantidade) AS on_hand,
  0 AS reserved,
  MAX(p.estoqueMinimo) AS minimum_stock,
  NOW() AS updated_at
FROM products p
JOIN catalog_brands b
  ON b.name = CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END
JOIN catalog_measures m
  ON m.description = TRIM(p.medida)
JOIN catalog_product_types t
  ON t.name = TRIM(p.categoria)
JOIN catalog_models cm
  ON cm.brand_id = b.id
 AND cm.product_type_id = t.id
 AND cm.name = TRIM(p.name)
JOIN products_v2 pv2
  ON pv2.brand_id = b.id
 AND pv2.measure_id = m.id
 AND pv2.product_type_id = t.id
 AND pv2.model_id = cm.id
JOIN branches br
  ON br.code = 'MATRIZ'
GROUP BY br.id, pv2.id
ON DUPLICATE KEY UPDATE
  on_hand = VALUES(on_hand),
  minimum_stock = VALUES(minimum_stock),
  updated_at = VALUES(updated_at);

-- 4) Movimentacoes historicas (legado -> V2)
INSERT INTO inventory_movements (
  branch_id,
  product_id,
  movement_type,
  quantity,
  quantity_before,
  quantity_after,
  reserved_before,
  reserved_after,
  reference_type,
  reference_id,
  reason,
  performed_by,
  created_at
)
SELECT
  br.id AS branch_id,
  pv2.id AS product_id,
  CASE
    WHEN mov.tipo = 'entrada' THEN 'IN'
    WHEN mov.tipo = 'saida' THEN 'OUT'
    ELSE 'ADJUSTMENT'
  END AS movement_type,
  mov.quantidade AS quantity,
  mov.quantidadeAnterior AS quantity_before,
  mov.quantidadeNova AS quantity_after,
  0 AS reserved_before,
  0 AS reserved_after,
  'LEGACY_MOV' AS reference_type,
  CAST(mov.id AS CHAR) AS reference_id,
  COALESCE(mov.observacao, 'Migracao legado') AS reason,
  mov.userId AS performed_by,
  mov.createdAt AS created_at
FROM movimentacoes mov
JOIN products p
  ON p.id = mov.productId
JOIN catalog_brands b
  ON b.name = CASE
    WHEN p.marca IS NULL OR TRIM(p.marca) = '' THEN 'SEM_MARCA'
    ELSE TRIM(p.marca)
  END
JOIN catalog_measures m
  ON m.description = TRIM(p.medida)
JOIN catalog_product_types t
  ON t.name = TRIM(p.categoria)
JOIN catalog_models cm
  ON cm.brand_id = b.id
 AND cm.product_type_id = t.id
 AND cm.name = TRIM(p.name)
JOIN products_v2 pv2
  ON pv2.brand_id = b.id
 AND pv2.measure_id = m.id
 AND pv2.product_type_id = t.id
 AND pv2.model_id = cm.id
JOIN branches br
  ON br.code = 'MATRIZ'
WHERE NOT EXISTS (
  SELECT 1
  FROM inventory_movements im
  WHERE im.reference_type = 'LEGACY_MOV'
    AND im.reference_id = CAST(mov.id AS CHAR)
);

COMMIT;
