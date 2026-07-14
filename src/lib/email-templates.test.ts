import { describe, it, expect } from "vitest";
import {
  EMAIL_TEMPLATES,
  getEmailTemplateDef,
  interpolateSubject,
  interpolateText,
  interpolateHtml,
  renderEmail,
} from "./email-templates";

describe("email template rendering", () => {
  const vars = {
    name: "Jane & Co <x>",
    url: "https://example.com/a?b=1&c=2",
    block: { text: "T-BLOCK", html: "<table><tr><td>ok</td></tr></table>" },
  };

  it("interpolates scalar tokens in the subject and trims", () => {
    expect(interpolateSubject("Hi {{name}} ", vars)).toBe("Hi Jane & Co <x>");
    expect(interpolateSubject("Missing {{nope}}!", vars)).toBe("Missing !");
  });

  it("renders text with a block's text form and collapses blank runs", () => {
    const out = interpolateText("A\n\n{{block}}\n\n\n\nB", vars);
    expect(out).toBe("A\n\nT-BLOCK\n\nB");
  });

  it("escapes scalars and autolinks URLs in HTML", () => {
    const html = interpolateHtml("Hello {{name}} see {{url}}", vars);
    expect(html).toContain("Jane &amp; Co &lt;x&gt;");
    expect(html).toContain('<a href="https://example.com/a?b=1&amp;c=2">');
  });

  it("emits a lone block placeholder as raw HTML without a <p> wrapper", () => {
    const html = interpolateHtml("Intro\n\n{{block}}\n\nOutro", vars);
    expect(html).toContain("<table><tr><td>ok</td></tr></table>");
    expect(html).not.toContain("<p style=\"margin:0 0 12px\"><table");
  });

  it("uses overrides when present and falls back to defaults when blank", () => {
    const def = getEmailTemplateDef("survey_invite")!;
    const withOverride = renderEmail(def, { subject: "Custom {{who}}", body: "" }, { who: "Sam" });
    expect(withOverride.subject).toBe("Custom Sam");
    // blank body falls back to the default template, which greets {{who}}
    expect(withOverride.textBody).toContain("Hi Sam,");
  });

  it("every catalog template has a key, subject and body", () => {
    for (const t of EMAIL_TEMPLATES) {
      expect(t.key).toBeTruthy();
      expect(t.defaultSubject.length).toBeGreaterThan(0);
      expect(t.defaultBody.length).toBeGreaterThan(0);
    }
  });
});
