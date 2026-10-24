// GET /api/status: auto-refreshing HTML page of the last 10 kit events.
import { recentKitEvents } from "../kit/events.js";

const esc = (s) =>
  String(s ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]);

export default function handler(req, res) {
  const events = recentKitEvents(10);
  const rows = events.length
    ? events
        .map(
          (e) =>
            `<tr><td class="t" data-ts="${esc(e.ts)}">${esc(e.ts)}</td><td>${esc(e.type)}</td><td>${esc(e.summary)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="empty">No events yet</td></tr>`;

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Kit status</title>
<style>
body{font:20px/1.4 system-ui,sans-serif;margin:16px;background:#fff;color:#111}
h1{font-size:28px;margin:0 0 12px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #ddd;vertical-align:top;word-break:break-word}
th{font-size:16px;color:#555}
.t{white-space:nowrap;font-variant-numeric:tabular-nums}
.empty{text-align:center;color:#777;padding:24px}
</style></head><body>
<h1>Kit status</h1>
<table><thead><tr><th>Time</th><th>Type</th><th>Summary</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>document.querySelectorAll("[data-ts]").forEach(function(td){var d=new Date(td.dataset.ts);if(!isNaN(d))td.textContent=d.toLocaleTimeString();});</script>
</body></html>`);
}
