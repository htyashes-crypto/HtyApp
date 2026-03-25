import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteCli = path.join(rootPath, "node_modules", "vite", "bin", "vite.js");
const electronBinary = process.platform === "win32"
  ? path.join(rootPath, "node_modules", "electron", "dist", "electron.exe")
  : path.join(rootPath, "node_modules", ".bin", "electron");

function createChildEnv(extra = {}) {
  const env = {
    ...process.env,
    ...extra
  };

  delete env.NODE_OPTIONS;
  delete env.VSCODE_INSPECTOR_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function spawnCommand(command, args, extraEnv = {}) {
  return spawn(command, args, {
    cwd: rootPath,
    stdio: "inherit",
    env: createChildEnv(extraEnv),
    windowsHide: false
  });
}

async function waitForRenderer(url, timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // wait until the dev server is ready
    }

    await delay(500);
  }

  throw new Error(`renderer dev server did not start within ${timeoutMs}ms`);
}

const vite = spawnCommand(process.execPath, [viteCli, "--host", "127.0.0.1", "--port", "1420", "--strictPort"]);

const shutdown = () => {
  if (!vite.killed) {
    vite.kill();
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

vite.on("exit", (code) => {
  if (code && code !== 0) {
    process.exit(code);
  }
});

try {
  await waitForRenderer("http://127.0.0.1:1420");
  const electron = spawnCommand(electronBinary, ["electron/main.cjs"], {
    ELECTRON_RENDERER_URL: "http://127.0.0.1:1420"
  });

  electron.on("exit", (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
} catch (error) {
  shutdown();
  console.error(error);
  process.exit(1);
}
