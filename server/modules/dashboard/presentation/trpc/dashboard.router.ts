import { z } from "zod";
import { managerOrAdminProcedure, protectedProcedure, router, withRateLimit } from "../../../../_core/trpc";
import { DashboardService } from "../../application/services/dashboard.service";
import { toTrpcError } from "../../../shared/utils/trpc-error";

const dashboardService = new DashboardService();

const dateRangeInput = z.object({
  startDate: z.date(),
  endDate: z.date(),
});

export const dashboardRouter = router({
  stats: protectedProcedure
    .use(withRateLimit({ scope: "dashboard.stats", max: 120, windowMs: 60 * 1000 }))
    .query(async () => {
      try {
        return await dashboardService.stats();
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  topSelling: protectedProcedure
    .use(withRateLimit({ scope: "dashboard.top_selling", max: 120, windowMs: 60 * 1000 }))
    .input(dateRangeInput.extend({ limit: z.number().optional().default(5) }))
    .query(async ({ input }) => {
      try {
        return await dashboardService.topSelling(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  salesByDate: protectedProcedure
    .use(withRateLimit({ scope: "dashboard.sales_by_date", max: 120, windowMs: 60 * 1000 }))
    .input(dateRangeInput)
    .query(async ({ input }) => {
      try {
        return await dashboardService.salesByDate(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  salesByCategory: protectedProcedure
    .use(withRateLimit({ scope: "dashboard.sales_by_category", max: 120, windowMs: 60 * 1000 }))
    .input(dateRangeInput)
    .query(async ({ input }) => {
      try {
        return await dashboardService.salesByCategory(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  salesByMedida: protectedProcedure
    .use(withRateLimit({ scope: "dashboard.sales_by_medida", max: 120, windowMs: 60 * 1000 }))
    .input(dateRangeInput)
    .query(async ({ input }) => {
      try {
        return await dashboardService.salesByMedida(input);
      } catch (error) {
        throw toTrpcError(error);
      }
    }),

  replenishmentSuggestions: managerOrAdminProcedure.query(async () => {
    try {
      return await dashboardService.replenishmentSuggestions();
    } catch (error) {
      throw toTrpcError(error);
    }
  }),
});
