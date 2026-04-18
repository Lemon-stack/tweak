#!/usr/bin/env node
import { createServer } from "http";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { buildPrompt, callAi, patchFile, getSourceContext } from "@tweak/core";
import type { ComponentContext } from "@tweak/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Config ---

interface TwkConfig {
  apiKey: string;
  provider: "anthropic" | "openai" | "gemini";
  model: string;
  port: number;
}

function loadConfig(): TwkConfig {
  const configPath = join(process.cwd(), "twk.json");
  if (!existsSync(configPath)) {
    console.error("twk.json not found. Run `tweak init` first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, "utf-8")) as TwkConfig;
}

// --- tweak init ---

function runInit() {
  const configPath = join(process.cwd(), "twk.json");
  if (existsSync(configPath)) {
    console.log("twk.json already exists.");
  } else {
    const config: TwkConfig = {
      apiKey: "your-api-key-here",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      port: 7567,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    console.log("Created twk.json — fill in your API key and you're ready.");
  }

  const injected = injectOverlayScript();
  if (injected === "added") {
    console.log("Injected overlay script into index.html.");
  } else if (injected === "already-present") {
    console.log("Overlay script already present in index.html.");
  } else {
    const fallback = injectOverlayBootstrap();
    if (fallback === "added") {
      console.log("Injected overlay bootstrap into Vite entry.");
    } else if (fallback === "already-present") {
      console.log("Overlay bootstrap already present in Vite entry.");
    } else {
      console.log("No Vite entry found.");
    }
  }
}

// --- Bridge server ---

async function runServer() {
  const config = loadConfig();
  const port = config.port ?? 7567;

  const overlayPath = join(__dirname, "../public/overlay.js");

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    res.setHeader("Access-Control-Allow-Origin", "*");

    if (req.method === "GET" && url.pathname === "/overlay.js") {
      if (!existsSync(overlayPath)) {
        res.statusCode = 503;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("overlay.js not built yet");
        return;
      }

      const js = readFileSync(overlayPath, "utf-8");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript");
      res.end(js);
      return;
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/edit") {
      let body: ComponentContext;
      try {
        body = (await readJson(req)) as ComponentContext;
      } catch {
        jsonError(res, "Invalid JSON body", 400);
        return;
      }

      let { filePath, startLine, endLine } = body;
      filePath = normalizeSourcePath(filePath);

      const rangeStart = Math.max(1, Math.min(startLine, endLine));
      const rangeEnd = Math.max(rangeStart, Math.max(startLine, endLine));
      const targetLine = Math.floor((rangeStart + rangeEnd) / 2);

      if (!existsSync(filePath)) {
        jsonError(res, `File not found: ${filePath}`, 404);
        return;
      }

      const { sourceContext } = getSourceContext(filePath, targetLine);
      const ctx: ComponentContext = {
        ...body,
        filePath,
        startLine: rangeStart,
        endLine: rangeEnd,
        sourceContext,
      };
      const prompt = buildPrompt(ctx);

      let edit;
      try {
        edit = await callAi(
          {
            provider: config.provider,
            model: config.model,
            apiKey: config.apiKey,
          },
          prompt,
        );
      } catch (err) {
        jsonError(res, `AI call failed: ${String(err)}`, 502);
        return;
      }

      try {
        patchFile(filePath, edit);
      } catch (err) {
        jsonError(res, `File patch failed: ${String(err)}`, 500);
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, edit }));
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  });

  server.listen(port);

  console.log(`Tweak bridge running on http://localhost:${port}`);
  console.log(`Serving overlay.js from ${overlayPath}`);
}

function jsonError(res: import("http").ServerResponse, message: string, status: number) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

function readJson(req: import("http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function injectOverlayScript(): "added" | "already-present" | "missing" {
  const indexHtmlPath = join(process.cwd(), "index.html");

  if (!existsSync(indexHtmlPath)) {
    return "missing";
  }

  const scriptTag = '<script src="http://localhost:7567/overlay.js"></script>';
  const content = readFileSync(indexHtmlPath, "utf-8");

  if (content.includes(scriptTag)) {
    return "already-present";
  }

  const nextContent = content.includes("</body>")
    ? content.replace("</body>", `  ${scriptTag}\n</body>`)
    : `${content}\n${scriptTag}\n`;

  writeFileSync(indexHtmlPath, nextContent, "utf-8");
  return "added";
}

function injectOverlayBootstrap(): "added" | "already-present" | "missing" {
  const entryCandidates = [
    join(process.cwd(), "src", "main.tsx"),
    join(process.cwd(), "src", "main.jsx"),
    join(process.cwd(), "src", "main.ts"),
    join(process.cwd(), "src", "main.js"),
  ];

  const entryPath = entryCandidates.find((candidate) => existsSync(candidate));
  if (!entryPath) return "missing";

  const marker = "http://localhost:7567/overlay.js";
  const content = readFileSync(entryPath, "utf-8");
  if (content.includes(marker)) return "already-present";

  const bootstrap = `
if (typeof document !== "undefined") {
  const existing = document.querySelector('script[src="http://localhost:7567/overlay.js"]');
  if (!existing) {
    const script = document.createElement("script");
    script.src = "http://localhost:7567/overlay.js";
    script.async = true;
    document.head.appendChild(script);
  }
}
`;

  const nextContent = `${bootstrap.trimStart()}\n${content}`;
  writeFileSync(entryPath, nextContent, "utf-8");
  return "added";
}

function normalizeSourcePath(inputPath: string): string {
  let path = inputPath;

  try {
    const parsed = new URL(path);
    path = parsed.pathname;
  } catch {
    // Not a URL.
  }

  path = path.replace(/^\/@fs\//, "/");

  if (path.startsWith("/src/") || path === "/src") {
    return resolve(process.cwd(), `.${path}`);
  }

  if (path.startsWith("/")) {
    return path;
  }

  return resolve(process.cwd(), path);
}

// --- Entry ---

const command = process.argv[2];

if (command === "init") {
  runInit();
} else {
  runServer();
}
