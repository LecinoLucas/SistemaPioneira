import { z } from "zod";

export const loginInputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const userIdSchema = z.object({ userId: z.number().int().positive() });

export const permissionEntrySchema = z.object({
  permissionKey: z.string().min(3).max(191),
  allowed: z.boolean(),
});

export const updateUserPermissionsSchema = z.object({
  userId: z.number().int().positive(),
  permissions: z.array(permissionEntrySchema).max(500),
});

export const auditFilterSchema = z
  .object({
    limit: z.number().int().min(1).max(500).default(100),
    action: z.string().optional(),
    status: z.enum(["success", "failed", "blocked"]).optional(),
    actorContains: z.string().optional(),
  })
  .optional();

export const auditExportSchema = z
  .object({
    limit: z.number().int().min(1).max(1000).default(500),
    action: z.string().optional(),
    status: z.enum(["success", "failed", "blocked"]).optional(),
    actorContains: z.string().optional(),
  })
  .optional();

export const rateLimitStatsSchema = z
  .object({
    scopePrefix: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .optional();

export const rateLimitClearSchema = z.object({
  scopePrefix: z.string().optional(),
  identityContains: z.string().optional(),
  maxDelete: z.number().int().min(1).max(5000).default(500),
});

export const stockAnomaliesSchema = z
  .object({
    windowMinutes: z.number().int().min(1).max(240).default(30),
    thresholdEvents: z.number().int().min(2).max(200).default(10),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .optional();
