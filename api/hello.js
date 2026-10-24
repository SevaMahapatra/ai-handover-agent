// GET /api/hello: hello-world, same file locally (server.js) and on Vercel.
export default function handler(req, res) {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ ok: true, hello: "world", time: new Date().toISOString() }));
}
