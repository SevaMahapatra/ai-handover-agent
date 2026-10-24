// scrapeUrl(url) -> {url, title, text}. Plain fetch + HTML strip. (Firecrawl skipped: no FIRECRAWL_API_KEY in .env.)
export async function scrapeUrl(url) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (hackathon-kit)" }, redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  const html = await res.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return { url: res.url, title, text };
}

// CLI: node kit/scrape.js <url>
if (import.meta.filename === process.argv[1]) {
  const r = await scrapeUrl(process.argv[2] ?? "https://zapdoslabs.com");
  console.log(`${r.url}\ntitle: ${r.title}\n${r.text.length} chars\n---\n${r.text.slice(0, 600)}`);
}
