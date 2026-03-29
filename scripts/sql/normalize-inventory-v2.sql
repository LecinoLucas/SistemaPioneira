-- Estoque V2 - Estrutura normalizada para escala e governanca
-- MySQL 8+
-- Nao remove tabelas legadas. Executa em paralelo (modelo de migracao segura).

START TRANSACTION;

CREATE TABLE IF NOT EXISTS branches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_branches_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS catalog_brands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_catalog_brands_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS catalog_measures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  description VARCHAR(120) NULL,
  width_cm DECIMAL(7,2) NULL,
  length_cm DECIMAL(7,2) NULL,
  height_cm DECIMAL(7,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_catalog_measures_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS catalog_product_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_catalog_product_types_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS catalog_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brand_id INT NOT NULL,
  product_type_id INT NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(64) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_catalog_models_brand FOREIGN KEY (brand_id) REFERENCES catalog_brands(id),
  CONSTRAINT fk_catalog_models_product_type FOREIGN KEY (product_type_id) REFERENCES catalog_product_types(id),
  CONSTRAINT uk_catalog_models_brand_type_name UNIQUE (brand_id, product_type_id, name),
  CONSTRAINT uk_catalog_models_code UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS products_v2 (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NULL,
  name VARCHAR(255) NOT NULL,
  brand_id INT NOT NULL,
  measure_id INT NOT NULL,
  product_type_id INT NOT NULL,
  model_id INT NOT NULL,
  is_sellable TINYINT(1) NOT NULL DEFAULT 1,
  is_archived TINYINT(1) NOT NULL DEFAULT 0,
  inactivation_reason TEXT NULL,
  archive_reason TEXT NULL,
  cost_price DECIMAL(10,2) NULL,
  sale_price DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_v2_brand FOREIGN KEY (brand_id) REFERENCES catalog_brands(id),
  CONSTRAINT fk_products_v2_measure FOREIGN KEY (measure_id) REFERENCES catalog_measures(id),
  CONSTRAINT fk_products_v2_type FOREIGN KEY (product_type_id) REFERENCES catalog_product_types(id),
  CONSTRAINT fk_products_v2_model FOREIGN KEY (model_id) REFERENCES catalog_models(id),
  CONSTRAINT uk_products_v2_sku UNIQUE (sku),
  CONSTRAINT uk_products_v2_catalog_key UNIQUE (brand_id, measure_id, product_type_id, model_id)
);

-- Vínculo estável legado -> produto V2 (permite múltiplos legados para 1 V2)
CREATE TABLE IF NOT EXISTS legacy_product_links (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  legacy_product_id INT NOT NULL,
  product_v2_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uk_legacy_product_links_legacy UNIQUE (legacy_product_id),
  CONSTRAINT fk_legacy_product_links_product_v2 FOREIGN KEY (product_v2_id) REFERENCES products_v2(id)
);

-- SKU automatico quando nao informado.
DROP TRIGGER IF EXISTS trg_products_v2_sku_after_insert;
DROP TRIGGER IF EXISTS trg_products_v2_sku_before_insert;
DELIMITER $$
CREATE TRIGGER trg_products_v2_sku_before_insert
BEFORE INSERT ON products_v2
FOR EACH ROW
BEGIN
  IF NEW.sku IS NULL OR NEW.sku = '' THEN
    SET NEW.sku = CONCAT('SKU-', UPPER(REPLACE(UUID(), '-', '')));
  END IF;
END$$
DELIMITER ;

CREATE TABLE IF NOT EXISTS inventory_balances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  product_id INT NOT NULL,
  on_hand INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  available INT AS (on_hand - reserved) STORED,
  minimum_stock INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_balances_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_inventory_balances_product FOREIGN KEY (product_id) REFERENCES products_v2(id),
  CONSTRAINT uk_inventory_balances_branch_product UNIQUE (branch_id, product_id),
  CONSTRAINT ck_inventory_balances_non_negative_reserved CHECK (reserved >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  product_id INT NOT NULL,
  reference_type VARCHAR(40) NOT NULL,
  reference_id VARCHAR(80) NOT NULL,
  quantity INT NOT NULL,
  status ENUM('OPEN', 'RELEASED', 'CONSUMED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  notes TEXT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_reservations_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_inventory_reservations_product FOREIGN KEY (product_id) REFERENCES products_v2(id),
  CONSTRAINT ck_inventory_reservations_qty_positive CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  product_id INT NOT NULL,
  movement_type ENUM('IN','OUT','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT','RESERVE','RELEASE') NOT NULL,
  quantity INT NOT NULL,
  quantity_before INT NOT NULL,
  quantity_after INT NOT NULL,
  reserved_before INT NOT NULL DEFAULT 0,
  reserved_after INT NOT NULL DEFAULT 0,
  reference_type VARCHAR(40) NULL,
  reference_id VARCHAR(80) NULL,
  reason TEXT NULL,
  performed_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_movements_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT fk_inventory_movements_product FOREIGN KEY (product_id) REFERENCES products_v2(id),
  CONSTRAINT ck_inventory_movements_qty_positive CHECK (quantity > 0)
);

-- Indices de performance
CREATE INDEX idx_catalog_models_brand ON catalog_models (brand_id);
CREATE INDEX idx_catalog_models_type ON catalog_models (product_type_id);
CREATE INDEX idx_catalog_measures_dims ON catalog_measures (width_cm, length_cm, height_cm);

CREATE INDEX idx_products_v2_sellable_archived ON products_v2 (is_sellable, is_archived);
CREATE INDEX idx_products_v2_brand_measure ON products_v2 (brand_id, measure_id);
CREATE INDEX idx_products_v2_type_model ON products_v2 (product_type_id, model_id);
CREATE INDEX idx_products_v2_name ON products_v2 (name);
CREATE INDEX idx_legacy_product_links_product_v2 ON legacy_product_links (product_v2_id);

CREATE INDEX idx_inventory_balances_product ON inventory_balances (product_id);
CREATE INDEX idx_inventory_balances_branch ON inventory_balances (branch_id);
CREATE INDEX idx_inventory_balances_low_stock ON inventory_balances (branch_id, available, minimum_stock);

CREATE INDEX idx_inventory_reservations_lookup ON inventory_reservations (branch_id, product_id, status);
CREATE INDEX idx_inventory_reservations_reference ON inventory_reservations (reference_type, reference_id);

CREATE INDEX idx_inventory_movements_product_date ON inventory_movements (product_id, created_at);
CREATE INDEX idx_inventory_movements_branch_date ON inventory_movements (branch_id, created_at);
CREATE INDEX idx_inventory_movements_reference ON inventory_movements (reference_type, reference_id);

-- Seed minimo para operar multi-filial
INSERT INTO branches (code, name)
SELECT 'MATRIZ', 'Matriz'
WHERE NOT EXISTS (SELECT 1 FROM branches WHERE code = 'MATRIZ');

COMMIT;
