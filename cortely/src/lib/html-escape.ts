/** Escape for HTML text nodes — never use as the only XSS defense with innerHTML. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Opens a print window using DOM text nodes only (no HTML interpolation of user data).
 */
export function printPlainReceipt(lines: string[], title = "Cortely") {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.title = title;
  const pre = w.document.createElement("pre");
  pre.style.fontFamily = "sans-serif";
  pre.style.padding = "24px";
  pre.style.whiteSpace = "pre-wrap";
  pre.textContent = lines.join("\n");
  w.document.body.appendChild(pre);
  w.focus();
  w.print();
}
