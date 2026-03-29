import * as db from "../../../../db";
import { appCache, CACHE_TTL } from "../../../../_core/cache";
const CACHE_BRANDS_KEY = "catalog:brands:all";
const CACHE_MEASURES_KEY = "catalog:measures:all";
const CACHE_TYPES_KEY = "catalog:types:all";
const CACHE_MODELS_KEY = "catalog:models:all";
const CACHE_PAYMENT_METHODS_KEY = "catalog:payment-methods:all";
const CACHE_SELLERS_KEY = "catalog:sellers:all";

export class MarcasService {
  async list() {
    return appCache.getOrSet(CACHE_BRANDS_KEY, () => db.getAllCatalogBrands(), CACHE_TTL.LONG);
  }

  async create(input: { nome: string }) {
    const result = await db.createCatalogBrand(input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async update(id: number, input: { nome: string }) {
    const result = await db.updateCatalogBrand(id, { nome: input.nome });
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async delete(id: number) {
    const result = await db.deleteCatalogBrand(id);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async listMeasures() {
    return appCache.getOrSet(CACHE_MEASURES_KEY, () => db.getAllCatalogMeasures(), CACHE_TTL.LONG);
  }

  async createMeasure(input: { nome: string }) {
    const result = await db.createCatalogMeasure(input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async updateMeasure(id: number, input: { nome: string }) {
    const result = await db.updateCatalogMeasure(id, { nome: input.nome });
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async deleteMeasure(id: number) {
    const result = await db.deleteCatalogMeasure(id);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async listTypes() {
    return appCache.getOrSet(CACHE_TYPES_KEY, () => db.getAllCatalogProductTypes(), CACHE_TTL.LONG);
  }

  async createType(input: { nome: string }) {
    const result = await db.createCatalogProductType(input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async updateType(id: number, input: { nome: string }) {
    const result = await db.updateCatalogProductType(id, { nome: input.nome });
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async deleteType(id: number) {
    const result = await db.deleteCatalogProductType(id);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async listModels() {
    return appCache.getOrSet(CACHE_MODELS_KEY, () => db.getAllCatalogModels(), CACHE_TTL.LONG);
  }

  async createModel(input: { nome: string; brandId: number; productTypeId: number }) {
    const result = await db.createCatalogModel(input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async updateModel(id: number, input: { nome: string; brandId: number; productTypeId: number }) {
    const result = await db.updateCatalogModel(id, input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async deleteModel(id: number) {
    const result = await db.deleteCatalogModel(id);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async syncFromProducts() {
    const result = await db.syncCatalogFromLegacyProducts();
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async listPaymentMethods() {
    return appCache.getOrSet(CACHE_PAYMENT_METHODS_KEY, () => db.getAllCatalogPaymentMethods(), CACHE_TTL.LONG);
  }

  async createPaymentMethod(input: { codigo: string; nome: string; categoria: string }) {
    const result = await db.createCatalogPaymentMethod(input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async updatePaymentMethod(id: number, input: { codigo: string; nome: string; categoria: string }) {
    const result = await db.updateCatalogPaymentMethod(id, input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async deletePaymentMethod(id: number) {
    const result = await db.deleteCatalogPaymentMethod(id);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async listSellers() {
    return appCache.getOrSet(CACHE_SELLERS_KEY, () => db.getAllCatalogSellers(), CACHE_TTL.LONG);
  }

  async createSeller(input: { nome: string }) {
    const result = await db.createCatalogSeller(input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async updateSeller(id: number, input: { nome: string }) {
    const result = await db.updateCatalogSeller(id, input);
    appCache.invalidatePrefix("catalog:");
    return result;
  }

  async deleteSeller(id: number) {
    const result = await db.deleteCatalogSeller(id);
    appCache.invalidatePrefix("catalog:");
    return result;
  }
}
