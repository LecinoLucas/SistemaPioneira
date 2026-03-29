import { trpc } from "@/lib/trpc";
import { API_BASE_URL } from "@/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error: unknown) => {
        if (failureCount >= 1) return false;

        const trpcCode = (error as { data?: { code?: string } })?.data?.code;
        const httpStatus = (error as { data?: { httpStatus?: number } })?.data?.httpStatus;

        if (
          trpcCode === "UNAUTHORIZED" ||
          trpcCode === "FORBIDDEN" ||
          httpStatus === 401 ||
          httpStatus === 403
        ) {
          return false;
        }

        return true;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});

if (import.meta.env.DEV) {
  const recentNetworkWarnings = new Map<string, number>();
  const NETWORK_WARNING_TTL_MS = 10_000;

  const isFailedFetchError = (error: unknown) => {
    const message = String((error as { message?: string })?.message ?? "").toLowerCase();
    return message.includes("failed to fetch") || message.includes("networkerror");
  };
  const isMissingProcedureError = (error: unknown) => {
    const message = String((error as { message?: string })?.message ?? "");
    return message.includes('No procedure found on path "auth.myPermissions"') ||
      message.includes('No procedure found on path "auth.userPermissions"');
  };

  const shouldSilenceQueryError = (queryKey: unknown, error: unknown) => {
    if (isMissingProcedureError(error)) {
      const key = JSON.stringify(queryKey ?? "");
      return key.includes("auth") && (key.includes("myPermissions") || key.includes("userPermissions"));
    }
    if (!isFailedFetchError(error)) return false;
    const key = JSON.stringify(queryKey ?? "");
    return key.includes("auth") && key.includes("me");
  };

  const warnOnce = (key: string, message: string, payload: unknown) => {
    const now = Date.now();
    const last = recentNetworkWarnings.get(key) ?? 0;
    if (now - last < NETWORK_WARNING_TTL_MS) return;
    recentNetworkWarnings.set(key, now);
    console.warn(message, payload);
  };

  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      const error = event.query.state.error;
      const queryKey = event.query.queryKey;
      if (shouldSilenceQueryError(queryKey, error)) {
        if (isMissingProcedureError(error)) {
          warnOnce(
            "auth.permissions.missing-procedure",
            "[API Query Warning] Backend sem procedures de permissões (auth.myPermissions/auth.userPermissions).",
            error
          );
          return;
        }
        warnOnce(
          "auth.me.failed-fetch",
          "[API Query Warning] auth.me indisponível (backend offline ou reiniciando).",
          error
        );
        return;
      }
      console.error("[API Query Error]", error);
    }
  });

  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "error") {
      const error = event.mutation.state.error;
      console.error("[API Mutation Error]", error);
    }
  });
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${API_BASE_URL}/api/trpc`,
      transformer: superjson,
      fetch: (input, init) =>
        globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        }),
    }),
  ],
});

if (import.meta.env.DEV) {
  window.addEventListener("error", (event) => {
    console.error("[Frontend Error]", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[Frontend Unhandled Rejection]", event.reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
