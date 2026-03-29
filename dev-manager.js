#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const LOG_DIR = path.join(ROOT_DIR, ".dev-logs");
const PROCESS_FILE = path.join(ROOT_DIR, "processes.json");
const BACKEND_LOG = path.join(LOG_DIR, "backend.log");
const FRONTEND_LOG = path.join(LOG_DIR, "frontend.log");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const state = {
  backendUrl: "http://localhost:3001",
  frontendUrl: "http://localhost:5173",
  shuttingDown: false,
};

const DEFAULT_BACKEND_PORT = 3001;
const DEFAULT_FRONTEND_PORT = 5173;
const KNOWN_BACKEND_PORTS = [3001, 3002, 3008];
const KNOWN_FRONTEND_PORTS = [5173, 5174];

async function httpGetJson(url, timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { ok: response.ok, status: response.status, body: parsed, raw: text };
  } catch (error) {
    return { ok: false, status: 0, body: null, raw: String(error) };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePort(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return fallback;
  return Math.trunc(n);
}

async function findAvailablePort(startPort, maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    const busy = await isPortListening(port);
    if (!busy) return port;
  }
  throw new Error(`Não foi possível encontrar porta livre a partir de ${startPort}.`);
}

async function waitForBackendHealth(baseUrl, timeoutMs = 25000, intervalMs = 500) {
  const startedAt = Date.now();
  let lastProbe = null;

  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    lastProbe = await httpGetJson(`${baseUrl}/api/health`, 1500);
    if (lastProbe.ok && lastProbe.body?.ok === true) {
      return { ok: true, probe: lastProbe, elapsedMs: Date.now() - startedAt };
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }

  return { ok: false, probe: lastProbe, elapsedMs: Date.now() - startedAt };
}

async function waitForFrontendReady(baseUrl, timeoutMs = 25000, intervalMs = 500) {
  const startedAt = Date.now();
  let lastProbe = null;

  while (Date.now() - startedAt < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    lastProbe = await httpGetJson(`${baseUrl}/@vite/client`, 1500);
    if (lastProbe.ok && typeof lastProbe.raw === "string" && lastProbe.raw.length > 0) {
      return { ok: true, probe: lastProbe, elapsedMs: Date.now() - startedAt };
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }

  return { ok: false, probe: lastProbe, elapsedMs: Date.now() - startedAt };
}

async function isCompatibleBackend(port) {
  const health = await httpGetJson(`http://127.0.0.1:${port}/api/health`);
  return Boolean(health.ok && health.body && typeof health.body === "object" && health.body.ok === true);
}

async function isLikelyViteFrontend(port) {
  const clientProbe = await httpGetJson(`http://127.0.0.1:${port}/@vite/client`);
  if (clientProbe.ok && clientProbe.raw.includes("/@vite/client")) {
    return true;
  }
  const htmlProbe = await httpGetJson(`http://127.0.0.1:${port}/`);
  if (!htmlProbe.ok) return false;
  return (
    htmlProbe.raw.includes("/@vite/client") ||
    htmlProbe.raw.includes("type=\"module\"") ||
    htmlProbe.raw.includes("vite")
  );
}

async function showStatus() {
  const processes = readProcesses();
  const backendPort = parsePort(processes?.backend?.port, DEFAULT_BACKEND_PORT);
  const frontendPort = parsePort(processes?.frontend?.port, DEFAULT_FRONTEND_PORT);
  const backendUrl = processes?.backend?.url || `http://localhost:${backendPort}`;
  const frontendUrl = processes?.frontend?.url || `http://localhost:${frontendPort}`;

  const [backendListening, frontendListening] = await Promise.all([
    isPortListening(backendPort),
    isPortListening(frontendPort),
  ]);

  console.log(`backend: ${backendListening ? "running" : "stopped"} (${backendUrl})`);
  console.log(`frontend: ${frontendListening ? "running" : "stopped"} (${frontendUrl})`);
  console.log(
    `managed-pids: backend=${processes?.backend?.pid ?? "none"} frontend=${processes?.frontend?.pid ?? "none"}`
  );
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureFile(filePath, content = "") {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

function readProcesses() {
  try {
    ensureFile(
      PROCESS_FILE,
      JSON.stringify(
        { backend: null, frontend: null, startedAt: null },
        null,
        2
      )
    );
    const raw = fs.readFileSync(PROCESS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      backend: parsed.backend ?? null,
      frontend: parsed.frontend ?? null,
      startedAt: parsed.startedAt ?? null,
    };
  } catch {
    return { backend: null, frontend: null, startedAt: null };
  }
}

function writeProcesses(data) {
  fs.writeFileSync(PROCESS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function isPidRunning(pid) {
  if (!pid || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function isPortListeningOnHost(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(350);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function isPortListening(port) {
  if (await isPortListeningOnHost(port, "127.0.0.1")) return true;
  if (await isPortListeningOnHost(port, "::1")) return true;
  return false;
}

function tailLines(content, n) {
  const lines = content.split(/\r?\n/);
  return lines.slice(Math.max(lines.length - n, 0)).join("\n");
}

function showLogs() {
  ensureDir(LOG_DIR);
  ensureFile(BACKEND_LOG, "");
  ensureFile(FRONTEND_LOG, "");

  const backendText = fs.readFileSync(BACKEND_LOG, "utf8");
  const frontendText = fs.readFileSync(FRONTEND_LOG, "utf8");

  console.log("=== BACKEND (últimas 100 linhas) ===");
  console.log(tailLines(backendText, 100) || "(sem logs)");
  console.log("=== FRONTEND (últimas 100 linhas) ===");
  console.log(tailLines(frontendText, 100) || "(sem logs)");
}

function killProcessTree(pid) {
  if (!isPidRunning(pid)) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }

  try {
    process.kill(-Number(pid), "SIGTERM");
  } catch {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      return;
    }
  }

  setTimeout(() => {
    if (!isPidRunning(pid)) return;
    try {
      process.kill(-Number(pid), "SIGKILL");
    } catch {
      try {
        process.kill(Number(pid), "SIGKILL");
      } catch {
        // ignore
      }
    }
  }, 1200);
}

function listPidsListeningOnPort(port) {
  const result = spawnSync("lsof", ["-ti", `tcp:${port}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

  if (result.status !== 0 || !result.stdout) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 1);
}

function forceStopPorts(ports) {
  const uniquePorts = Array.from(new Set(ports.filter((p) => Number.isFinite(p) && p > 0)));
  const pids = new Set();

  for (const port of uniquePorts) {
    const listeningPids = listPidsListeningOnPort(port);
    for (const pid of listeningPids) {
      if (pid !== process.pid) pids.add(pid);
    }
  }

  if (pids.size === 0) {
    console.log("[DEV-MANAGER] Nenhum processo órfão encontrado nas portas de dev.");
    return;
  }

  for (const pid of pids) {
    killProcessTree(pid);
    console.log(`[DEV-MANAGER] processo encerrado por limpeza full: PID ${pid}`);
  }
}

async function forcePortForService(port, serviceLabel) {
  const busy = await isPortListening(port);
  if (!busy) return;

  const pids = listPidsListeningOnPort(port).filter((pid) => pid !== process.pid);
  if (pids.length === 0) return;

  for (const pid of pids) {
    killProcessTree(pid);
    console.log(`[DEV-MANAGER] ${serviceLabel}: porta ${port} ocupada. Processo encerrado (PID ${pid}).`);
  }

  await sleep(250);
}

function stopManagedProcesses({ silent = false } = {}) {
  const processes = readProcesses();

  if (processes.backend?.pid) {
    killProcessTree(processes.backend.pid);
    if (!silent) console.log(`[STOP] backend PID ${processes.backend.pid}`);
  }
  if (processes.frontend?.pid) {
    killProcessTree(processes.frontend.pid);
    if (!silent) console.log(`[STOP] frontend PID ${processes.frontend.pid}`);
  }

  writeProcesses({ backend: null, frontend: null, startedAt: null });
}

function appendLog(filePath, chunk) {
  fs.appendFileSync(filePath, chunk, "utf8");
}

function printPrefixed(prefix, text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log(`${prefix} ${line}`);
  }
}

function detectPortAndUpdate(service, text) {
  const urlMatch = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i);
  const portMatch = text.match(/\bport(?:a)?\s*[:=]?\s*(\d{2,5})\b/i);
  const port = urlMatch?.[1] || portMatch?.[1];
  if (!port) return;

  const nextUrl = `http://localhost:${port}`;
  if (service === "backend" && state.backendUrl !== nextUrl) {
    state.backendUrl = nextUrl;
    printStatus();
  }
  if (service === "frontend" && state.frontendUrl !== nextUrl) {
    state.frontendUrl = nextUrl;
    printStatus();
  }
}

function attachLogging(child, service) {
  const prefix = service === "backend" ? "[BACKEND]" : "[FRONTEND]";
  const logFile = service === "backend" ? BACKEND_LOG : FRONTEND_LOG;

  const onData = (chunk) => {
    const text = chunk.toString();
    appendLog(logFile, text);
    printPrefixed(prefix, text);
    detectPortAndUpdate(service, text);
  };

  child.stdout?.on("data", onData);
  child.stderr?.on("data", onData);
}

function printStatus() {
  console.log("status: running");
  console.log(`backend: ${state.backendUrl}`);
  console.log(`frontend: ${state.frontendUrl}`);
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function resolveServiceConfig() {
  const backendCandidates = ["backend", "server"];
  const frontendCandidates = ["frontend", "client"];

  const backendDir = backendCandidates
    .map((name) => path.join(ROOT_DIR, name))
    .find((dir) => fileExists(dir));
  const frontendDir = frontendCandidates
    .map((name) => path.join(ROOT_DIR, name))
    .find((dir) => fileExists(dir));

  const backendHasOwnPackage = backendDir
    ? fileExists(path.join(backendDir, "package.json"))
    : false;
  const frontendHasOwnPackage = frontendDir
    ? fileExists(path.join(frontendDir, "package.json"))
    : false;

  return {
    backend: backendHasOwnPackage
      ? { cmd: npmCmd, args: ["run", "dev"], cwd: backendDir, env: process.env }
      : {
          // Usa execução direta com tsx (sem watch) para evitar falhas intermitentes
          // de IPC do "tsx watch" que derrubam o backend e causam ECONNREFUSED no frontend.
          cmd: "node",
          args: ["--import", "tsx", "server/_core/index.ts"],
          cwd: ROOT_DIR,
          env: { ...process.env, PORT: "3001", NODE_ENV: "development" },
        },
    frontend: frontendHasOwnPackage
      ? { cmd: npmCmd, args: ["run", "dev"], cwd: frontendDir, env: process.env }
      : { cmd: npmCmd, args: ["run", "dev:frontend"], cwd: ROOT_DIR, env: process.env },
    backendDir,
    frontendDir,
  };
}

function assertProjectDirs() {
  const { backendDir, frontendDir } = resolveServiceConfig();
  if (!backendDir) {
    throw new Error("Diretório backend/server não encontrado.");
  }
  if (!frontendDir) {
    throw new Error("Diretório frontend/client não encontrado.");
  }
}

async function start() {
  assertProjectDirs();
  ensureDir(LOG_DIR);
  fs.writeFileSync(BACKEND_LOG, "", "utf8");
  fs.writeFileSync(FRONTEND_LOG, "", "utf8");

  stopManagedProcesses({ silent: true });

  const existing = readProcesses();
  if (
    (existing.backend?.pid && isPidRunning(existing.backend.pid)) ||
    (existing.frontend?.pid && isPidRunning(existing.frontend.pid))
  ) {
    console.log("Já existem processos em execução gerenciados pelo dev-manager.");
    printStatus();
    process.exit(0);
  }

  const services = resolveServiceConfig();
  const desiredBackendPort = parsePort(process.env.BACKEND_PORT, DEFAULT_BACKEND_PORT);
  const desiredFrontendPort = parsePort(process.env.FRONTEND_PORT, DEFAULT_FRONTEND_PORT);
  const backendPort = desiredBackendPort;
  const frontendPort = desiredFrontendPort;

  await forcePortForService(backendPort, "backend");
  await forcePortForService(frontendPort, "frontend");

  const backendBaseUrl = `http://localhost:${backendPort}`;
  state.backendUrl = backendBaseUrl;

  const frontendBaseUrl = `http://localhost:${frontendPort}`;
  state.frontendUrl = frontendBaseUrl;

  const backend = spawn(services.backend.cmd, services.backend.args, {
    cwd: services.backend.cwd,
    detached: false,
    env: {
      ...services.backend.env,
      PORT: String(backendPort),
      FRONTEND_URL: `${frontendBaseUrl},http://localhost:5173,http://localhost:5174`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const frontendArgs = services.frontend.args.concat(["--", "--port", String(frontendPort)]);

  const frontend = spawn(services.frontend.cmd, frontendArgs, {
    cwd: services.frontend.cwd,
    detached: false,
    env: {
      ...services.frontend.env,
      FRONTEND_PORT: String(frontendPort),
      PORT: String(frontendPort),
      VITE_API_BASE_URL: backendBaseUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  writeProcesses({
    startedAt: new Date().toISOString(),
    backend: {
      pid: backend?.pid ?? null,
      cwd: services.backend.cwd,
      logFile: BACKEND_LOG,
      port: backendPort,
      url: backendBaseUrl,
      reused: false,
    },
    frontend: {
      pid: frontend?.pid ?? null,
      cwd: services.frontend.cwd,
      logFile: FRONTEND_LOG,
      port: frontendPort,
      url: frontendBaseUrl,
      reused: false,
    },
  });

  if (backend) attachLogging(backend, "backend");
  if (frontend) attachLogging(frontend, "frontend");

  const backendHealth = await waitForBackendHealth(backendBaseUrl);
  if (!backendHealth.ok) {
    console.error(
      `[DEV-MANAGER] backend não ficou saudável em ${backendBaseUrl} após ${backendHealth.elapsedMs}ms.`
    );
    if (backendHealth.probe?.status) {
      console.error(
        `[DEV-MANAGER] último status recebido: ${backendHealth.probe.status}`
      );
    }
    if (backendHealth.probe?.raw) {
      console.error(`[DEV-MANAGER] último retorno: ${backendHealth.probe.raw}`);
    }
    stopManagedProcesses({ silent: true });
    throw new Error("backend_healthcheck_failed");
  }

  printStatus();
  console.log(
    `[DEV-MANAGER] backend saudável em ${backendBaseUrl} (${backendHealth.elapsedMs}ms).`
  );

  const frontendReady = await waitForFrontendReady(frontendBaseUrl, 12000, 400);
  if (frontendReady.ok) {
    console.log(
      `[DEV-MANAGER] frontend saudável em ${frontendBaseUrl} (${frontendReady.elapsedMs}ms).`
    );
  } else {
    console.warn(
      `[DEV-MANAGER] frontend não respondeu como Vite em ${frontendBaseUrl} após ${frontendReady.elapsedMs}ms.`
    );
  }

  const shutdown = (signal = "SIGTERM") => {
    if (state.shuttingDown) return;
    state.shuttingDown = true;
    console.log(`[DEV-MANAGER] Encerrando processos (${signal})...`);
    stopManagedProcesses({ silent: true });
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("exit", () => {
    if (!state.shuttingDown) stopManagedProcesses({ silent: true });
  });
  process.on("uncaughtException", (err) => {
    console.error("[DEV-MANAGER] uncaughtException:", err);
    shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (err) => {
    console.error("[DEV-MANAGER] unhandledRejection:", err);
    shutdown("unhandledRejection");
  });

  if (backend) {
    backend.on("exit", (code, signal) => {
      if (state.shuttingDown) return;
      console.log(`[BACKEND] processo finalizado (code=${code ?? "null"}, signal=${signal ?? "null"})`);
      void isPortListening(backendPort)
        .then((listening) => {
          if (listening) {
            console.log(`[DEV-MANAGER] backend existente detectado na porta ${backendPort}, mantendo frontend ativo.`);
            return;
          }
          shutdown("backend-exit");
        })
        .catch(() => shutdown("backend-exit"));
    });
  }

  if (frontend) {
    frontend.on("exit", (code, signal) => {
      if (state.shuttingDown) return;
      console.log(`[FRONTEND] processo finalizado (code=${code ?? "null"}, signal=${signal ?? "null"})`);
      void waitForBackendHealth(backendBaseUrl, 8000, 400)
        .then((backendHealth) => {
          if (backendHealth.ok) {
            console.log(
              `[DEV-MANAGER] frontend caiu, mas backend segue ativo em ${backendBaseUrl}.`
            );
            console.log(
              "[DEV-MANAGER] reinicie apenas o frontend com: npm run dev:frontend -- --port 5173"
            );
            return;
          }
          shutdown("frontend-exit");
        })
        .catch(() => shutdown("frontend-exit"));
    });
  }

  process.stdin.resume();
}

async function fullStart() {
  const existing = readProcesses();
  const desiredBackendPort = parsePort(process.env.BACKEND_PORT, DEFAULT_BACKEND_PORT);
  const desiredFrontendPort = parsePort(process.env.FRONTEND_PORT, DEFAULT_FRONTEND_PORT);

  const cleanupPorts = [
    desiredBackendPort,
    desiredFrontendPort,
    ...(existing?.backend?.port ? [parsePort(existing.backend.port, DEFAULT_BACKEND_PORT)] : []),
    ...(existing?.frontend?.port ? [parsePort(existing.frontend.port, DEFAULT_FRONTEND_PORT)] : []),
    ...KNOWN_BACKEND_PORTS,
    ...KNOWN_FRONTEND_PORTS,
  ];

  stopManagedProcesses({ silent: true });
  forceStopPorts(cleanupPorts);
  await start();
}

async function main() {
  const command = process.argv[2] || "start";

  switch (command) {
    case "start":
      await start();
      break;
    case "full":
      await fullStart();
      break;
    case "stop":
      stopManagedProcesses();
      console.log("Processos encerrados.");
      break;
    case "log":
      showLogs();
      break;
    case "status":
      await showStatus();
      break;
    default:
      console.log("Uso: node dev-manager.js <start|full|stop|log|status>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("[DEV-MANAGER] erro:", error);
  process.exit(1);
});
