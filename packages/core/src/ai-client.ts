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

export async function callAi(config: AiConfig, prompt: string): Promise<EditResult> {
  let raw: string;

  if (config.provider === "anthropic") {
    raw = await callAnthropic(config, prompt);
  } else if (config.provider === "openai") {
    raw = await callOpenAi(config, prompt);
  } else if (config.provider === "gemini") {
    raw = await callGemini(config, prompt);
  } else {
    throw new Error(`Unknown provider: ${config.provider}`);
  }

  const result = JSON.parse(raw) as EditResult;
  if (
    typeof result.startLine !== "number" ||
    typeof result.endLine !== "number" ||
    typeof result.replacement !== "string"
  ) {
    throw new Error(`AI returned malformed response: ${raw}`);
  }
  return result;
}

async function callAnthropic(config: AiConfig, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { text: string }[] };
  return data.content[0].text.trim();
}

async function callOpenAi(config: AiConfig, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
}

async function callGemini(config: AiConfig, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return data.candidates[0].content.parts[0].text.trim();
}
