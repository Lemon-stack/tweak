import {
  instrument,
  getFiberFromHostInstance,
  isCompositeFiber,
  getDisplayName,
  type Fiber,
} from "bippy";
import { getSource as getBippySource } from "bippy/source";

instrument({ onCommitFiberRoot: () => {} });

export interface FiberSource {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  componentName: string;
  componentTree: string;
}

export type FiberLookupResult =
  | { kind: "ok"; source: FiberSource }
  | { kind: "no-fiber" }
  | { kind: "no-debug-source" };

export async function getFiberSource(el: Element): Promise<FiberLookupResult> {
  let hostEl: Element | null = el;
  let fiber: Fiber | null = null;

  while (hostEl && !fiber) {
    fiber = getFiberFromHostInstance(hostEl);
    if (!fiber) hostEl = hostEl.parentElement;
  }

  if (!fiber) return { kind: "no-fiber" };

  let node: Fiber | null = fiber;
  while (node) {
    const source = (node as any)._debugSource;
    if (source?.fileName) return toLookupSource(source, buildTree(node));
    node = node.return ?? null;
  }

  node = fiber;
  while (node) {
    const source = await getBippySource(node);
    if (source?.fileName) return toLookupSource(source, buildTree(node));
    node = node.return ?? null;
  }

  return { kind: "no-debug-source" };
}

function buildTree(from: Fiber): string[] {
  const names: string[] = [];
  let walker: Fiber | null = from;
  while (walker) {
    if (isCompositeFiber(walker)) {
      const name = getDisplayName(walker.type);
      if (name) names.unshift(name);
    }
    walker = walker.return ?? null;
  }
  return names;
}

function toLookupSource(
  source: { fileName: string; lineNumber?: number; columnNumber?: number },
  treeNames: string[]
): FiberLookupResult {
  return {
    kind: "ok",
    source: {
      filePath: source.fileName,
      lineNumber: source.lineNumber ?? 1,
      columnNumber: source.columnNumber ?? 0,
      componentName: treeNames[treeNames.length - 1] ?? "Unknown",
      componentTree: treeNames.join(" > "),
    },
  };
}
