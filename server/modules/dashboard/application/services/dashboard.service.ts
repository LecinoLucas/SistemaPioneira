import * as db from "../../../../db";
import { appCache, CACHE_TTL } from "../../../../_core/cache";

export class DashboardService {
  async stats() {
    return appCache.getOrSet(
      "dashboard:stats",
      () => db.getDashboardStats(),
      CACHE_TTL.MEDIUM
    );
  }

  async topSelling(input: { startDate: Date; endDate: Date; limit?: number }) {
    const key = `dashboard:top_selling:${input.startDate.toISOString()}:${input.endDate.toISOString()}:${input.limit ?? 5}`;
    return appCache.getOrSet(
      key,
      () => db.getTopSellingProducts(input.startDate, input.endDate, input.limit ?? 5),
      CACHE_TTL.MEDIUM
    );
  }

  async salesByDate(input: { startDate: Date; endDate: Date }) {
    const key = `dashboard:sales_by_date:${input.startDate.toISOString()}:${input.endDate.toISOString()}`;
    return appCache.getOrSet(
      key,
      () => db.getSalesByDateRange(input.startDate, input.endDate),
      CACHE_TTL.MEDIUM
    );
  }

  async salesByCategory(input: { startDate: Date; endDate: Date }) {
    const key = `dashboard:sales_by_category:${input.startDate.toISOString()}:${input.endDate.toISOString()}`;
    return appCache.getOrSet(
      key,
      () => db.getSalesByCategory(input.startDate, input.endDate),
      CACHE_TTL.MEDIUM
    );
  }

  async salesByMedida(input: { startDate: Date; endDate: Date }) {
    const key = `dashboard:sales_by_medida:${input.startDate.toISOString()}:${input.endDate.toISOString()}`;
    return appCache.getOrSet(
      key,
      () => db.getSalesByMedida(input.startDate, input.endDate),
      CACHE_TTL.MEDIUM
    );
  }

  async replenishmentSuggestions() {
    return appCache.getOrSet(
      "dashboard:replenishment",
      () => db.getReplenishmentSuggestions(),
      CACHE_TTL.SHORT
    );
  }

  async v2Health() {
    return appCache.getOrSet(
      "dashboard:v2_health",
      () => db.getV2HealthSnapshot(),
      CACHE_TTL.SHORT
    );
  }

  /** Call this after any sale/stock change so the dashboard doesn't serve stale data. */
  invalidate() {
    appCache.invalidatePrefix("dashboard:");
  }
}
