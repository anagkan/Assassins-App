import { Marked } from "marked";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Raw HTML in markdown is escaped, not rendered.
const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: { html: ({ text }) => escape(text) },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false });
}
