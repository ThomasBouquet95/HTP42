import { describe, it, expect } from "vitest";
import { extractPostedContext, normalizeUrl, renderSignalSlack } from "./signals";

describe("normalizeUrl", () => {
  it("strips www, trailing slash and lowercases", () => {
    expect(normalizeUrl("https://www.Reuters.com/Article/123/")).toBe("reuters.com/article/123");
  });
  it("treats http and https the same host+path", () => {
    expect(normalizeUrl("http://fda.gov/news")).toBe("fda.gov/news");
  });
  it("falls back for garbage input", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("extractPostedContext", () => {
  it("pulls the headline and the source URL out of a rendered post", () => {
    const post = renderSignalSlack({
      headline: "FDA issues draft guidance on AI in trials",
      whatHappened: "The agency published a draft.",
      whyItMatters: "Sets expectations for validation.",
      watch: null,
      sourceUrl: "https://www.fda.gov/news/ai-guidance",
      sourceName: "FDA",
    });
    const { headlines, urlKeys } = extractPostedContext([post]);
    expect(headlines).toContain("FDA issues draft guidance on AI in trials");
    expect(urlKeys.has("fda.gov/news/ai-guidance")).toBe(true);
  });

  it("extracts URLs inside Slack's <...> and <...|label> wrapping", () => {
    const texts = [
      "*Some headline*\nbody\n<https://reuters.com/x/1>",
      "*Another*\n<https://nature.com/y/2|Nature>",
    ];
    const { urlKeys } = extractPostedContext(texts);
    expect(urlKeys.has("reuters.com/x/1")).toBe(true);
    expect(urlKeys.has("nature.com/y/2")).toBe(true);
  });

  it("ignores empty / whitespace-only messages", () => {
    const { headlines, urlKeys } = extractPostedContext(["", "   ", "\n\n"]);
    expect(headlines).toEqual([]);
    expect(urlKeys.size).toBe(0);
  });

  it("does not treat a bare link line as a headline", () => {
    const { headlines } = extractPostedContext(["🔗 https://reuters.com/x/1"]);
    expect(headlines).toEqual([]);
  });
});
