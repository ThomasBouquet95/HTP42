// Shared, dependency-free HTML handling for members' internal notes. Notes
// support only a tiny allowlist of inline formatting (bold / italic /
// underline + line breaks); everything else is stripped, so the stored HTML is
// safe to render with dangerouslySetInnerHTML (admins author and read these).

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "br"]);

// Keep only the allowlisted formatting tags (dropping every attribute) and
// remove all other markup. script/style blocks are removed content-and-all.
export function sanitizeNoteHtml(input: string): string {
  if (!input) return "";
  let html = input.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag) => {
    const t = String(tag).toLowerCase();
    if (!ALLOWED.has(t)) return "";
    if (t === "br") return "<br>";
    return m.startsWith("</") ? `</${t}>` : `<${t}>`;
  });
  return html.trim();
}

// Turn a legacy plain-text note into safe HTML (escaped, newlines → <br>).
export function plainTextToHtml(text: string): string {
  if (!text) return "";
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(/\r?\n/g, "<br>");
}

// The visible text of a note (used to decide whether it's empty).
export function noteHtmlToPlain(html: string): string {
  return sanitizeNoteHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}
