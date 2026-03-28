import React, { useEffect, useRef, useState, useCallback } from "react";
import { getFiberSource, type FiberSource } from "./fiber";

const BRIDGE_URL = "http://localhost:7567/edit";

interface PromptState {
  x: number;
  y: number;
  rect: DOMRect;
  source: FiberSource;
  renderedHtml: string;
}

export function Overlay() {
  const [enabled, setEnabled] = useState(false);
  const [highlight, setHighlight] = useState<DOMRect | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const hoveredEl = useRef<Element | null>(null);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!enabled || prompt) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest("#tweak-root")) return;
      hoveredEl.current = el;
      setHighlight(el.getBoundingClientRect());
    },
    [enabled, prompt],
  );

  const handleClick = useCallback(
    async (e: MouseEvent) => {
      if (!enabled) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el.closest("#tweak-root")) return;
      e.preventDefault();
      e.stopPropagation();

      const result = await getFiberSource(el);
      if (result.kind === "no-fiber") {
        setStatus("No React fiber found here.");
        return;
      }
      if (result.kind === "no-debug-source") {
        setStatus("Source info unavailable — is this app running in dev mode?");
        return;
      }

      setPrompt({
        x: e.clientX,
        y: e.clientY,
        rect: el.getBoundingClientRect(),
        source: result.source,
        renderedHtml: el.outerHTML,
      });
      setHighlight(null);
    },
    [enabled],
  );

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("click", handleClick, true);
    };
  }, [handleMouseMove, handleClick]);

  useEffect(() => {
    document.body.style.cursor = enabled ? "crosshair" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [enabled]);

  async function submitEdit() {
    if (!prompt || !instruction.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(BRIDGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: prompt.source.filePath,
          startLine: prompt.source.lineNumber,
          endLine: prompt.source.lineNumber,
          sourceContext: "",
          renderedHtml: prompt.renderedHtml,
          componentTree: prompt.source.componentTree,
          instruction: instruction.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setStatus("Done!");
      setPrompt(null);
      setInstruction("");
    } catch (err) {
      setStatus(`Error: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const fileName = prompt
    ? (prompt.source.filePath.split(/[\\/]/).pop() ?? prompt.source.filePath)
    : null;

  return (
    <>
      {/* Highlight box */}
      {enabled &&
        (highlight || prompt) &&
        (() => {
          const rect = prompt ? prompt.rect : highlight!;
          return (
            <div
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                outline: "2px solid #6366f1",
                backgroundColor: "rgba(99,102,241,0.08)",
                pointerEvents: "none",
                zIndex: 2147483645,
              }}
            />
          );
        })()}

      {/* Prompt dialog */}
      {prompt && (
        <div
          style={{
            position: "fixed",
            top: Math.min(prompt.y + 12, window.innerHeight - 120),
            left: Math.min(prompt.x + 12, window.innerWidth - 360),
            width: 340,
            background: "#ffffff",
            borderRadius: 12,
            zIndex: 2147483646,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            fontFamily: "system-ui, sans-serif",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderBottom: "1px solid #f0f0f0",
            }}
          >
            <span style={{ fontSize: 12, color: "#111827", fontWeight: 500 }}>
              {prompt.source.componentTree.split(" > ").pop()}
            </span>
            <span style={{ fontSize: 12, color: "#d1d5db" }}>·</span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>
              {fileName}:{prompt.source.lineNumber}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 8px 6px 12px",
              gap: 6,
            }}
          >
            <input
              autoFocus
              type="text"
              placeholder="Add context"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitEdit();
                if (e.key === "Escape") {
                  setPrompt(null);
                  setInstruction("");
                }
              }}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#111827",
                fontSize: 13,
                padding: "4px 0",
              }}
            />
            <button
              onClick={submitEdit}
              disabled={loading || !instruction.trim()}
              style={{
                width: 28,
                height: 28,
                background:
                  instruction.trim() && !loading ? "#6366f1" : "#f3f4f6",
                border: "none",
                borderRadius: 8,
                cursor: loading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
            >
              {loading ? (
                <span
                  style={{
                    width: 10,
                    height: 10,
                    border: "2px solid #d1d5db",
                    borderTopColor: "#6366f1",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "tweak-spin 0.6s linear infinite",
                  }}
                />
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 10V2M6 2L2.5 5.5M6 2L9.5 5.5"
                    stroke={instruction.trim() ? "#fff" : "#9ca3af"}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
          <style>{`@keyframes tweak-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Status toast */}
      {status && (
        <div
          onClick={() => setStatus(null)}
          style={{
            position: "fixed",
            bottom: 70,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "8px 16px",
            color: "#0f172a",
            fontSize: 13,
            zIndex: 2147483646,
            fontFamily: "system-ui, sans-serif",
            boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
            cursor: "pointer",
          }}
        >
          {status}
        </div>
      )}

      {/* Toggle */}
      <div
        onClick={() => {
          setEnabled((v) => !v);
          setPrompt(null);
          setHighlight(null);
          setStatus(null);
        }}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 20,
          padding: "6px 12px",
          fontFamily: "system-ui, sans-serif",
          fontSize: 12,
          color: "#0f172a",
          cursor: "pointer",
          userSelect: "none",
          boxShadow: "0 6px 20px rgba(15,23,42,0.1)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 18,
            background: enabled ? "#6366f1" : "#d1d5db",
            borderRadius: 9,
            position: "relative",
            transition: "background 0.2s",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              left: enabled ? 17 : 3,
              width: 12,
              height: 12,
              background: "#fff",
              borderRadius: "50%",
              transition: "left 0.2s",
            }}
          />
        </div>
        Tweak
      </div>
    </>
  );
}
