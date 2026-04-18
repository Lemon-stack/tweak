import { readFileSync, writeFileSync } from "fs";
import { extname } from "path";
import ts from "typescript";
import type { EditResult } from "./ai-client.js";

export function patchFile(filePath: string, edit: EditResult): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  if (edit.startLine < 1 || edit.endLine < edit.startLine || edit.endLine > lines.length) {
    throw new Error(
      `Invalid edit range ${edit.startLine}-${edit.endLine} for file with ${lines.length} lines`,
    );
  }

  const before = lines.slice(0, edit.startLine - 1);
  const after = lines.slice(edit.endLine);
  const replacementLines = edit.replacement.split("\n");

  const patched = [...before, ...replacementLines, ...after].join("\n");
  validatePatchedSource(filePath, patched);
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
  const sourceContext = lines.slice(startLine - 1, endLine).join("\n");

  return { sourceContext, startLine, endLine };
}

function validatePatchedSource(filePath: string, source: string): void {
  const transpiled = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
    reportDiagnostics: true,
  });

  const diagnostics = transpiled.diagnostics ?? [];
  if (diagnostics.length === 0) {
    return;
  }

  const [diagnostic] = diagnostics;
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  throw new Error(`Patched code has syntax error: ${message}`);
}
