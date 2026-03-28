export interface ComponentContext {
  filePath: string;
  startLine: number;
  endLine: number;
  sourceContext: string;
  renderedHtml: string;
  componentTree: string;
  instruction: string;
}

export function buildPrompt(ctx: ComponentContext): string {
  return `You are a code editor. The user wants to modify a React component in their running dev app.

File: ${ctx.filePath}
Target lines: ${ctx.startLine}–${ctx.endLine}
Component tree: ${ctx.componentTree}

Source context:
\`\`\`tsx
${ctx.sourceContext}
\`\`\`

Rendered HTML of the grabbed element:
\`\`\`html
${ctx.renderedHtml}
\`\`\`

User instruction: ${ctx.instruction}

Respond with ONLY a JSON object in this exact shape — no explanation, no markdown, no code fences:
{"startLine": <number>, "endLine": <number>, "replacement": "<new source lines as a single string with \\n for newlines>"}

Rules:
- startLine and endLine must be within the source context shown above
- replacement must be valid TSX/JSX that fits in place of the original lines
- Preserve indentation exactly
- Do not change anything outside the target lines unless strictly necessary`;
}
