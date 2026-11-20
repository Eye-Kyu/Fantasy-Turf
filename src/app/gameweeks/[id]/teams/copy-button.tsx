"use client";

import { useState } from "react";

/** Copies the given text to the clipboard; falls back to telling the person to copy by hand. */
export function CopyButton({ text, label = "Copy message" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className="small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed: select the text above" : label}
    </button>
  );
}
