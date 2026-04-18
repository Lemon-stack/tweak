import { generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

export type Provider = "anthropic" | "openai" | "gemini";

export interface AiConfig {
  provider: Provider;
  model: string;
  apiKey: string;
}

export interface EditResult {
  startLine: number;
  endLine: number;
  replacement: string;
}

const editResultSchema = z.object({
  startLine: z.number().int().min(1),
  endLine: z.number().int().min(1),
  replacement: z.string(),
});

export async function callAi(config: AiConfig, prompt: string): Promise<EditResult> {
  const model = getModel(config);
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { object } = await generateObject({
        model,
        schema: editResultSchema,
        prompt,
      });

      if (object.endLine < object.startLine) {
        throw new Error(`AI returned invalid range ${object.startLine}-${object.endLine}`);
      }

      return object;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  throw new Error(`AI generation failed after ${maxAttempts} attempts: ${String(lastError)}`);
}

function getModel(config: AiConfig) {
  if (config.provider === "anthropic") {
    return createAnthropic({ apiKey: config.apiKey })(config.model);
  }

  if (config.provider === "openai") {
    return createOpenAI({ apiKey: config.apiKey })(config.model);
  }

  if (config.provider === "gemini") {
    return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
  }

  throw new Error(`Unknown provider: ${String(config.provider)}`);
}
