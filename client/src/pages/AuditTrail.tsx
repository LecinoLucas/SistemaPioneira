import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { buildAuthAuditSummary } from "@shared/auth-audit-presenter";
import { AUTH_AUDIT_ACTION, AUTH_AUDIT_LABEL, AUTH_LOGIN_AUDIT_ACTIONS } from "@shared/auth-governance";
import { ACTION_PERMISSION_CATALOG, parseScreenPathFromPermissionKey, SCREEN_CATALOG } from "@shared/access-governance";
import { STOCK_AUDIT_ACTION, STOCK_AUDIT_LABEL } from "@shared/stock-governance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type StatusFilter = "" | "success" | "failed" | "blocked";
const RATE_LIMIT_ALERT_THRESHOLD = 12;
const RATE_LIMIT_WARNING_THRESHOLD = 8;

const ACTION_LABELS: Record<string, string> = {
  ...AUTH_AUDIT_LABEL,
  ...STOCK_AUDIT_LABEL,
};

function formatActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

function formatPermissionLabel(permissionKey: string) {
  const action = ACTION_PERMISSION_CATALOG.find((item) => item.key === permissionKey);
  if (action) return `Ação: ${action.label}`;

  const path = parseScreenPathFromPermissionKey(permissionKey);
  if (path) {
    const screen = SCREEN_CATALOG.find((item) => item.path === path);
    if (screen) return `Tela: ${screen.label}`;
  }

  return permissionKey;
}

function buildAuditSummary(event: {
  action: string;
  status: string;
  actor?: { email?: string | null; openId?: string | null; id?: number | null } | null;
  target?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const actorLabel = event.actor?.email || event.actor?.openId || `id:${event.actor?.id ?? "-"}`;
  const authSummary = buildAuthAuditSummary(event, actorLabel);
  if (authSummary) return authSummary;

  if (event.action === STOCK_AUDIT_ACTION.PRODUCT_CREATED) {
    const qty = Number(event.metadata?.estoqueInicial ?? 0);
    return `Produto adicionado ao estoque com saldo inicial de ${qty} unidade(s).`;
  }
  if (event.action === STOCK_AUDIT_ACTION.PRODUCT_UPDATED) {
    const beforeQty = event.metadata?.before && typeof event.metadata.before === "object"
      ? Number((event.metadata.before as Record<string, unknown>).quantidade ?? 0)
      : null;
    const afterQty = event.metadata?.after && typeof event.metadata.after === "object"
      ? Number((event.metadata.after as Record<string, unknown>).quantidade ?? 0)
      : null;
    if (beforeQty !== null && afterQty !== null && beforeQty !== afterQty) {
      return `Estoque ajustado manualmente de ${beforeQty} para ${afterQty} unidade(s).`;
    }
    return "Dados do produto foram atualizados sem alteração de saldo de estoque.";
  }
  if (event.action === STOCK_AUDIT_ACTION.PRODUCT_DELETED) {
    return "Produto removido do cadastro de estoque.";
  }
  if (event.action === STOCK_AUDIT_ACTION.SALE_REGISTERED || event.action === STOCK_AUDIT_ACTION.SALE_REGISTERED_PUBLIC) {
    return "Venda registrada com baixa automática no estoque.";
  }
  if (event.action === STOCK_AUDIT_ACTION.SALE_CANCELLED) {
    return "Venda cancelada e estoque recomposto automaticamente.";
  }
  if (event.action === STOCK_AUDIT_ACTION.SALE_EDITED) {
    return "Venda editada com eventual ajuste automático no estoque.";
  }
  if (event.action === STOCK_AUDIT_ACTION.SALE_DELETED) {
    return "Venda excluída com reposição de estoque.";
  }
  if (event.status === "failed") {
    return "A operação falhou e deve ser investigada.";
  }
  if (event.status === "blocked") {
    return "A operação foi bloqueada por regra de segurança/governança.";
  }
  return "Evento registrado com sucesso.";
}

function getAuditChips(event: {
  actor?: { id?: number | null; ip?: string } | null;
  target?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  const chips: string[] = [];
  const target = event.target ?? {};
  const metadata = event.metadata ?? {};

  const pushIfPresent = (label: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    chips.push(`${label}: ${String(value)}`);
  };

  pushIfPresent("userId", target.userId ?? target.id ?? event.actor?.id);
  pushIfPresent("removed", metadata.removed);
  pushIfPresent("changed", metadata.changedCount);
  pushIfPresent("scope", metadata.scopePrefix);
  pushIfPresent("identity", metadata.identityContains);
  pushIfPresent("ip", event.actor?.ip);

  return chips.slice(0, 6);
}

function getPermissionDiffLines(event: {
  action: string;
  metadata?: Record<string, unknown> | null;
}) {
  if (event.action !== AUTH_AUDIT_ACTION.UPDATE_USER_PERMISSIONS) return [];
  const changedRaw = Array.isArray(event.metadata?.changedPermissions)
    ? (event.metadata?.changedPermissions as Array<Record<string, unknown>>)
    : [];

  return changedRaw.slice(0, 12).map((item) => {
    const permissionKey = String(item.permissionKey ?? "");
    const before = item.before;
    const after = item.after;
    const beforeText = before === null || before === undefined ? "default" : String(before);
    const afterText = after === null || after === undefined ? "default" : String(after);
    return `${formatPermissionLabel(permissionKey)}: ${beforeText} -> ${afterText}`;
  });
}

function getStorageUsageLevel(usagePercent: number) {
  if (usagePercent >= 95) return "critical";
  if (usagePercent >= 80) return "warning";
  return "ok";
}

export default function AuditTrail() {
  const [action, setAction] = useState("");
  const [actorContains, setActorContains] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [limit, setLimit] = useState(100);
  const [anomalyWindowMinutes, setAnomalyWindowMinutes] = useState(30);
  const [anomalyThreshold, setAnomalyThreshold] = useState(10);
  const [rateScopePrefix, setRateScopePrefix] = useState("");
  const [rateIdentityContains, setRateIdentityContains] = useState("");
  const [rateLimitRows, setRateLimitRows] = useState(50);
  const [mitigationConfirmation, setMitigationConfirmation] = useState("");

  const queryInput = useMemo(
    () => ({
      limit,
      action: action.trim() || undefined,
      actorContains: actorContains.trim() || undefined,
      status: (status || undefined) as "success" | "failed" | "blocked" | undefined,
    }),
    [action, actorContains, status, limit]
  );

  const eventsQuery = trpc.auth.auditEvents.useQuery(queryInput, {
    refetchOnWindowFocus: false,
  });
  const rateLimitQuery = trpc.auth.rateLimitStats.useQuery(
    {
      limit: rateLimitRows,
      scopePrefix: rateScopePrefix.trim() || undefined,
    },
    {
      refetchInterval: 10_000,
      refetchOnWindowFocus: false,
    }
  );
  const anomaliesQuery = trpc.auth.stockAnomalies.useQuery(
    {
      windowMinutes: anomalyWindowMinutes,
      thresholdEvents: anomalyThreshold,
      limit: 10,
    },
    {
      refetchInterval: 15_000,
      refetchOnWindowFocus: false,
    }
  );
  const auditStorageStatsQuery = trpc.auth.auditStorageStats.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const rateScopeSummary = useMemo(() => {
    const rows = rateLimitQuery.data ?? [];
    const map = new Map<
      string,
      { buckets: number; totalCount: number; peakCount: number; minReset: number }
    >();

    rows.forEach((item) => {
      const scopeGroup = item.scope.split(".")[0] || "outros";
      const current = map.get(scopeGroup);
      if (!current) {
        map.set(scopeGroup, {
          buckets: 1,
          totalCount: item.count,
          peakCount: item.count,
          minReset: item.resetInSeconds,
        });
        return;
      }
      current.buckets += 1;
      current.totalCount += item.count;
      current.peakCount = Math.max(current.peakCount, item.count);
      current.minReset = Math.min(current.minReset, item.resetInSeconds);
      map.set(scopeGroup, current);
    });

    return Array.from(map.entries())
      .map(([scope, values]) => ({ scope, ...values }))
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [rateLimitQuery.data]);
  const rateHotspots = useMemo(() => {
    const rows = rateLimitQuery.data ?? [];
    return rows
      .filter((item) => item.count >= RATE_LIMIT_ALERT_THRESHOLD)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [rateLimitQuery.data]);
  const loginHealthByActor = useMemo(() => {
    const events = eventsQuery.data ?? [];
    const map = new Map<
      string,
      {
        actor: string;
        success: number;
        failed: number;
        blocked: number;
        lastAt: string;
      }
    >();

    for (const event of events) {
      if (!AUTH_LOGIN_AUDIT_ACTIONS.includes(event.action as (typeof AUTH_LOGIN_AUDIT_ACTIONS)[number])) continue;

      const actor = event.actor?.email || event.actor?.openId || `id:${event.actor?.id ?? "-"}`;
      const current = map.get(actor) ?? {
        actor,
        success: 0,
        failed: 0,
        blocked: 0,
        lastAt: event.timestamp,
      };

      if (event.action === AUTH_AUDIT_ACTION.LOGIN_SUCCESS) current.success += 1;
      if (event.action === AUTH_AUDIT_ACTION.LOGIN_FAILED) current.failed += 1;
      if (event.action === AUTH_AUDIT_ACTION.LOGIN_BLOCKED) current.blocked += 1;
      if (new Date(event.timestamp).getTime() > new Date(current.lastAt).getTime()) {
        current.lastAt = event.timestamp;
      }

      map.set(actor, current);
    }

    return Array.from(map.values())
      .map((row) => {
        const total = row.success + row.failed + row.blocked;
        const riskScore = row.failed * 2 + row.blocked * 4;
        return {
          ...row,
          total,
          riskScore,
          riskLevel: row.blocked > 0 || riskScore >= 8 ? "high" : riskScore >= 3 ? "medium" : "low",
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore || b.total - a.total)
      .slice(0, 8);
  }, [eventsQuery.data]);
  const exportMutation = trpc.auth.auditExportCsv.useMutation({
    onSuccess: (data) => {
      const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success("CSV de auditoria exportado com sucesso.");
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao exportar CSV.");
    },
  });
  const clearRateLimitMutation = trpc.auth.rateLimitClear.useMutation({
    onSuccess: (data) => {
      toast.success(`Mitigação aplicada. Buckets removidos: ${data.removed}.`);
      setMitigationConfirmation("");
      void rateLimitQuery.refetch();
      void eventsQuery.refetch();
    },
    onError: (error) => {
      toast.error(error.message || "Falha ao limpar buckets de rate-limit.");
    },
  });
  const isMitigationConfirmed = mitigationConfirmation.trim().toUpperCase() === "MITIGAR";

  const statusBadgeVariant = (value: string) => {
    if (value === "success") return "default" as const;
    if (value === "failed") return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Auditoria</h1>
        <p className="text-muted-foreground mt-2">
          Consulte eventos críticos de autenticação e governança.
        </p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Saúde da Auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          {auditStorageStatsQuery.isLoading ? (
            <div className="py-4 text-sm text-muted-foreground">Carregando métricas de armazenamento...</div>
          ) : auditStorageStatsQuery.data ? (
            <div className="space-y-3">
              {(() => {
                const usagePercent =
                  auditStorageStatsQuery.data.maxSizeMb > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (auditStorageStatsQuery.data.activeFileMb / auditStorageStatsQuery.data.maxSizeMb) * 100
                        )
                      )
                    : 0;
                const level = getStorageUsageLevel(usagePercent);
                return (
                  <div
                    className={`rounded-md border p-3 ${
                      level === "critical"
                        ? "border-red-300 bg-red-50"
                        : level === "warning"
                        ? "border-amber-300 bg-amber-50"
                        : "border-emerald-300 bg-emerald-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">
                        Uso do arquivo ativo: {usagePercent}%
                      </div>
                      <Badge variant={level === "critical" ? "destructive" : "secondary"}>
                        {level === "critical" ? "Crítico" : level === "warning" ? "Atenção" : "Saudável"}
                      </Badge>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded bg-white/70">
                      <div
                        className={`h-full ${
                          level === "critical"
                            ? "bg-red-500"
                            : level === "warning"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    {level !== "ok" ? (
                      <div className="mt-2 text-xs">
                        {level === "critical"
                          ? "Arquivo ativo muito próximo do limite. Rotação ocorrerá em breve."
                          : "Arquivo ativo acima de 80% do limite configurado."}
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Arquivo ativo</div>
                <div className="text-lg font-semibold">{auditStorageStatsQuery.data.activeFileMb} MB</div>
                <div className="text-xs text-muted-foreground">
                  Limite de rotação: {auditStorageStatsQuery.data.maxSizeMb} MB
                </div>
              </div>
                <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Arquivos arquivados</div>
                <div className="text-lg font-semibold">{auditStorageStatsQuery.data.archiveFiles}</div>
                <div className="text-xs text-muted-foreground">
                  Volume total: {auditStorageStatsQuery.data.archiveMb} MB
                </div>
              </div>
                <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Retenção</div>
                <div className="text-lg font-semibold">{auditStorageStatsQuery.data.retentionDays} dias</div>
                <div className="text-xs text-muted-foreground">
                  Mais antigo:{" "}
                  {auditStorageStatsQuery.data.oldestArchiveAt
                    ? new Date(auditStorageStatsQuery.data.oldestArchiveAt).toLocaleString("pt-BR")
                    : "n/a"}
                </div>
              </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-sm text-muted-foreground">Sem dados de armazenamento no momento.</div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Detecção de Anomalias (Estoque)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input
              type="number"
              min={1}
              max={240}
              value={anomalyWindowMinutes}
              onChange={(e) => setAnomalyWindowMinutes(Number(e.target.value || 30))}
              placeholder="Janela (min)"
            />
            <Input
              type="number"
              min={2}
              max={200}
              value={anomalyThreshold}
              onChange={(e) => setAnomalyThreshold(Number(e.target.value || 10))}
              placeholder="Limite de eventos"
            />
            <Button
              variant="outline"
              onClick={() => anomaliesQuery.refetch()}
              disabled={anomaliesQuery.isFetching}
            >
              Atualizar análise
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              Auto-refresh 15s
            </div>
          </div>
          {anomaliesQuery.isLoading ? (
            <div className="py-6 text-center text-muted-foreground">Analisando comportamento...</div>
          ) : !anomaliesQuery.data || anomaliesQuery.data.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              Nenhuma anomalia relevante detectada no período.
            </div>
          ) : (
            <div className="space-y-3">
              {anomaliesQuery.data.map((item, index) => (
                <div
                  key={`${item.actor}-${item.lastAt}-${index}`}
                  className={`rounded-md border p-3 ${
                    item.riskLevel === "high"
                      ? "border-red-300 bg-red-50"
                      : item.riskLevel === "medium"
                      ? "border-amber-300 bg-amber-50"
                      : "bg-muted/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.riskLevel === "high" ? "destructive" : "secondary"}>
                      {item.riskLevel === "high" ? "Risco alto" : item.riskLevel === "medium" ? "Risco médio" : "Risco baixo"}
                    </Badge>
                    <span className="font-medium">{item.actor}</span>
                    {item.ip ? <span className="text-xs text-muted-foreground">IP: {item.ip}</span> : null}
                  </div>
                  <div className="mt-2 grid gap-2 text-xs md:grid-cols-4">
                    <div>Eventos: <span className="font-semibold">{item.totalEvents}</span></div>
                    <div>Falhas: <span className="font-semibold">{item.failedEvents}</span></div>
                    <div>Impacto (unid): <span className="font-semibold">{item.impactedUnits}</span></div>
                    <div>Último evento: <span className="font-semibold">{new Date(item.lastAt).toLocaleString("pt-BR")}</span></div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.actions.map((actionName) => (
                      <span
                        key={`${item.actor}-${actionName}`}
                        className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
                      >
                        {actionName}
                      </span>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActorContains(item.actor);
                        setAction("");
                        setStatus("");
                        setLimit(200);
                        toast.info(`Investigação aplicada para ator: ${item.actor}`);
                      }}
                    >
                      Investigar ator
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            placeholder={`Filtrar por action (ex: ${AUTH_AUDIT_ACTION.LOGIN_SUCCESS})`}
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <Input
            placeholder="Filtrar por ator (email, openId, ip, id)"
            value={actorContains}
            onChange={(e) => setActorContains(e.target.value)}
          />
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="">Todos os status</option>
            <option value="success">Sucesso</option>
            <option value="failed">Falha</option>
            <option value="blocked">Bloqueado</option>
          </select>
          <Input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value || 100))}
          />
          <Button onClick={() => eventsQuery.refetch()} disabled={eventsQuery.isFetching}>
            Atualizar
          </Button>
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate(queryInput)}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? "Exportando..." : "Exportar CSV"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {loginHealthByActor.length > 0 ? (
            <div className="mb-4 rounded-md border bg-muted/20 p-3">
              <div className="mb-2 text-sm font-semibold">Saúde de Login por Usuário (amostra atual)</div>
              <div className="grid gap-2 md:grid-cols-2">
                {loginHealthByActor.map((item) => (
                  <div
                    key={`${item.actor}-${item.lastAt}`}
                    className={`rounded-md border p-2 text-xs ${
                      item.riskLevel === "high"
                        ? "border-red-300 bg-red-50"
                        : item.riskLevel === "medium"
                        ? "border-amber-300 bg-amber-50"
                        : "bg-background"
                    }`}
                  >
                    <div className="font-medium">{item.actor}</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span>ok: <strong>{item.success}</strong></span>
                      <span>falha: <strong>{item.failed}</strong></span>
                      <span>bloqueio: <strong>{item.blocked}</strong></span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Último login: {new Date(item.lastAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {eventsQuery.isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Carregando auditoria...</div>
          ) : !eventsQuery.data || eventsQuery.data.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Nenhum evento encontrado.</div>
          ) : (
            <div className="space-y-3">
              {eventsQuery.data.map((event, index) => {
                const permissionDiffLines = getPermissionDiffLines(event);
                return (
                <div key={`${event.timestamp}-${event.action}-${index}`} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                    <span className="font-medium">{formatActionLabel(event.action)}</span>
                    <span className="text-xs rounded bg-muted px-2 py-0.5 font-mono">{event.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <div className="mt-2 rounded-md border bg-muted/30 p-2 text-sm text-foreground">
                    {buildAuditSummary(event)}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    <span>
                      Ator: {event.actor?.email || event.actor?.openId || `id:${event.actor?.id ?? "-"}`}
                    </span>
                    {event.actor?.role ? <span> • Perfil: {event.actor.role}</span> : null}
                    {event.actor?.ip ? <span> • IP: {event.actor.ip}</span> : null}
                  </div>
                  {getAuditChips(event).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {getAuditChips(event).map((chip, chipIndex) => (
                        <span
                          key={`${event.timestamp}-${event.action}-${chipIndex}`}
                          className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-mono text-muted-foreground"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {permissionDiffLines.length > 0 ? (
                    <div className="mt-3 rounded-md border bg-muted/20 p-2">
                      <div className="mb-1 text-[11px] uppercase text-muted-foreground">
                        Mudanças de permissão
                      </div>
                      <div className="space-y-1">
                        {permissionDiffLines.map((line, lineIndex) => (
                          <div
                            key={`${event.timestamp}-${event.action}-perm-${lineIndex}`}
                            className="text-xs text-foreground"
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Ver detalhes técnicos
                    </summary>
                    <div className="mt-2 space-y-2">
                      {event.target ? (
                        <div>
                          <div className="mb-1 text-[11px] uppercase text-muted-foreground">Alvo (target)</div>
                          <pre className="rounded bg-muted p-2 text-xs overflow-auto">
                            {JSON.stringify(event.target, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {event.metadata ? (
                        <div>
                          <div className="mb-1 text-[11px] uppercase text-muted-foreground">Metadados</div>
                          <pre className="rounded bg-muted p-2 text-xs overflow-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      {!event.target && !event.metadata ? (
                        <div className="text-xs text-muted-foreground">Sem dados adicionais neste evento.</div>
                      ) : null}
                    </div>
                  </details>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle>Rate Limit (tempo real)</CardTitle>
        </CardHeader>
        <CardContent>
          {rateHotspots.length > 0 ? (
            <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <div className="text-sm font-semibold">Atenção: consumo elevado detectado</div>
              <div className="mt-1 text-xs">
                Buckets acima de {RATE_LIMIT_ALERT_THRESHOLD} requisições na janela atual:
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {rateHotspots.map((item, index) => (
                  <span
                    key={`${item.scope}-${item.identity}-${index}`}
                    className="rounded-full border border-amber-300 bg-white px-2 py-1 font-mono text-[11px]"
                  >
                    {item.scope} • {item.identity} • {item.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {rateScopeSummary.length > 0 ? (
            <div className="mb-4 grid gap-3 md:grid-cols-3">
              {rateScopeSummary.slice(0, 3).map((scope) => (
                <div
                  key={scope.scope}
                  className={`rounded-md border p-3 ${
                    scope.peakCount >= RATE_LIMIT_ALERT_THRESHOLD
                      ? "border-amber-300 bg-amber-50"
                      : "bg-muted/30"
                  }`}
                >
                  <div className="text-xs text-muted-foreground">Escopo</div>
                  <div className="font-mono text-sm">{scope.scope}.*</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Buckets ativos: <span className="font-semibold text-foreground">{scope.buckets}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Total de hits: <span className="font-semibold text-foreground">{scope.totalCount}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Pico:{" "}
                    <span
                      className={`font-semibold ${
                        scope.peakCount >= RATE_LIMIT_ALERT_THRESHOLD
                          ? "text-amber-700"
                          : "text-foreground"
                      }`}
                    >
                      {scope.peakCount}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Menor reset: <span className="font-semibold text-foreground">{scope.minReset}s</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Filtro de escopo (ex: auth., vendas., dashboard.)"
              value={rateScopePrefix}
              onChange={(e) => setRateScopePrefix(e.target.value)}
            />
            <Input
              placeholder="Filtro de identidade (opcional)"
              value={rateIdentityContains}
              onChange={(e) => setRateIdentityContains(e.target.value)}
            />
            <Input
              type="number"
              min={1}
              max={500}
              value={rateLimitRows}
              onChange={(e) => setRateLimitRows(Number(e.target.value || 50))}
            />
            <Button
              variant="outline"
              onClick={() => rateLimitQuery.refetch()}
              disabled={rateLimitQuery.isFetching}
            >
              Atualizar métricas
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                clearRateLimitMutation.mutate({
                  scopePrefix: rateScopePrefix.trim() || undefined,
                  identityContains: rateIdentityContains.trim() || undefined,
                  maxDelete: 500,
                })
              }
              disabled={clearRateLimitMutation.isPending || !isMitigationConfirmed}
            >
              {clearRateLimitMutation.isPending ? "Aplicando..." : "Mitigar (limpar buckets filtrados)"}
            </Button>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              Auto-refresh 10s
            </div>
          </div>

          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="text-xs font-semibold text-red-800">
              Confirmação obrigatória para mitigação
            </div>
            <div className="mt-1 text-xs text-red-700">
              Para liberar a ação, digite <span className="font-mono font-semibold">MITIGAR</span>.
            </div>
            <Input
              className="mt-2 bg-white"
              placeholder="Digite MITIGAR"
              value={mitigationConfirmation}
              onChange={(e) => setMitigationConfirmation(e.target.value)}
            />
          </div>

          {rateLimitQuery.isLoading ? (
            <div className="py-6 text-center text-muted-foreground">Carregando métricas...</div>
          ) : !rateLimitQuery.data || rateLimitQuery.data.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              Sem buckets ativos no momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Escopo</th>
                    <th className="py-2 pr-3 font-medium">Identidade</th>
                    <th className="py-2 pr-3 font-medium">Contagem</th>
                    <th className="py-2 pr-3 font-medium">Reset (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {rateLimitQuery.data.map((item, idx) => (
                    <tr key={`${item.scope}-${item.identity}-${idx}`} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{item.scope}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{item.identity}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            item.count >= RATE_LIMIT_ALERT_THRESHOLD
                              ? "text-red-600 font-semibold"
                              : item.count >= RATE_LIMIT_WARNING_THRESHOLD
                              ? "text-amber-600 font-semibold"
                              : ""
                          }
                        >
                          {item.count}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={item.resetInSeconds <= 10 ? "text-indigo-600 font-semibold" : ""}>
                          {item.resetInSeconds}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
