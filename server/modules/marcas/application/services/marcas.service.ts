import * as db from "../../../../db";
import { appCache, CACHE_TTL } from "../../../../_core/cache";
import { DomainError } from "../../../shared/errors/domain-error";

const CACHE_KEY = "marcas:all";

export class MarcasService {
  async list() {
    return appCache.getOrSet(CACHE_KEY, () => db.getAllMarcas(), CACHE_TTL.LONG);
  }

  async create(input: { nome: string }) {
    const result = await db.createMarca(input);
    appCache.invalidatePrefix("marcas:");
    return result;
  }

  async update(id: number, input: { nome: string }) {
    const result = await db.updateMarca(id, { nome: input.nome });
    appCache.invalidatePrefix("marcas:");
    return result;
  }

  async delete(id: number) {
    const result = await db.deleteMarca(id);
    appCache.invalidatePrefix("marcas:");
    return result;
  }
}
