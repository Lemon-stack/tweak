import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { buildPrompt, callAi, patchFile, getSourceContext } from "@tweak/core";
import type { ComponentContext } from "@tweak/core";

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
    console.error("twk.json not found. Run `npx tweak init` first.");
    process.exit(1);
  }
  return JSON.parse(readFileSync(configPath, "utf-8")) as TwkConfig;
}

// --- tweak init ---

function runInit() {
  const configPath = join(process.cwd(), "twk.json");
  if (existsSync(configPath)) {
    console.log("twk.json already exists.");
    return;
  }
  const config: TwkConfig = {
    apiKey: "your-api-key-here",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    port: 7567,
  };
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  console.log("Created twk.json — fill in your API key and you're ready.");
  console.log(
    '\nAdd this to your app\'s HTML entry point:\n<script src="http://localhost:7567/overlay.js"></script>',
  );
}

// --- Bridge server ---

async function runServer() {
  const config = loadConfig();
  const port = config.port ?? 7567;

  const overlayPath = join(import.meta.dir, "../public/overlay.js");

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "GET" && url.pathname === "/overlay.js") {
        if (!existsSync(overlayPath)) {
          return new Response("overlay.js not built yet", { status: 503 });
        }
        const js = readFileSync(overlayPath, "utf-8");
        return new Response(js, {
          headers: {
            "Content-Type": "application/javascript",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      if (req.method === "POST" && url.pathname === "/edit") {
        let body: ComponentContext;
        try {
          body = (await req.json()) as ComponentContext;
        } catch {
          return jsonError("Invalid JSON body", 400);
        }

        const { filePath, startLine } = body;

        if (!existsSync(filePath)) {
          return jsonError(`File not found: ${filePath}`, 404);
        }

        const { sourceContext } = getSourceContext(filePath, startLine);
        const ctx: ComponentContext = { ...body, sourceContext };
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
          return jsonError(`AI call failed: ${String(err)}`, 502);
        }

        try {
          patchFile(filePath, edit);
        } catch (err) {
          return jsonError(`File patch failed: ${String(err)}`, 500);
        }

        return Response.json({ ok: true, edit });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`Tweak bridge running on http://localhost:${server.port}`);
  console.log(`Serving overlay.js from ${overlayPath}`);
}

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Access-Control-Allow-Origin": "*" } },
  );
}

// --- Entry ---

const command = process.argv[2];

if (command === "init") {
  runInit();
} else {
  runServer();
}
