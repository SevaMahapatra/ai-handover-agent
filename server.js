// Local dev server: routes /api/<name> to api/<name>.js (the same files Vercel deploys).
//   node server.js              # PORT=3001 node server.js for a second worktree
// Expose it for Twilio / Vapi / Retell webhooks:
//   winget install ngrok.ngrok
//   ngrok config add-authtoken <token from dashboard.ngrok.com>
//   ngrok http 3000             # use https://<id>.ngrok-free.app/api/inbound as the webhook URL
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT ?? 3000);

http
  .createServer(async (req, res) => {
    const name = new URL(req.url, "http://x").pathname.match(/^\/api\/([\w-]+)$/)?.[1] ?? (req.url === "/" ? "hello" : null);
    if (!name || !fs.existsSync(`api/${name}.js`)) {
      res.statusCode = 404;
      return res.end("not found");
    }
    try {
      const { default: handler } = await import(`./api/${name}.js`);
      await handler(req, res);
    } catch (e) {
      console.error(`[${name}]`, e);
      res.statusCode = 500;
      res.end(String(e.message));
    }
  })
  .listen(PORT, () => console.log(`dev server http://localhost:${PORT}  (routes: /api/<file in api/>)`));
