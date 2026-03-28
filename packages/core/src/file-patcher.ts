import { readFileSync, writeFileSync } from "fs";
import type { EditResult } from "./ai-client";

export function patchFile(filePath: string, edit: EditResult): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const before = lines.slice(0, edit.startLine - 1);
  const after = lines.slice(edit.endLine);
  const replacementLines = edit.replacement.split("\n");

  const patched = [...before, ...replacementLines, ...after].join("\n");
  writeFileSync(filePath, patched, "utf-8");
}

export function getSourceContext(
  filePath: string,
  targetLine: number,
  radius = 20,
): { sourceContext: string; startLine: number; endLine: number } {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const startLine = Math.max(1, targetLine - radius);
  const endLine = Math.min(lines.length, targetLine + radius);
  const sourceContext = lines
    .slice(startLine - 1, endLine)
    .map((l, i) => `${startLine + i}: ${l}`)
    .join("\n");

  return { sourceContext, startLine, endLine };
}
