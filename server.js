// Local server for the live workflow monitor: routes /api/<name> to api/<name>.js.
//   npm run monitor   ->   http://localhost:3000/  (or /api/flow)
import http from "node:http";
import fs from "node:fs";

const PORT = Number(process.env.PORT ?? 3000);

http
  .createServer(async (req, res) => {
    const name = new URL(req.url, "http://x").pathname.match(/^\/api\/([\w-]+)$/)?.[1] ?? (req.url === "/" ? "flow" : null);
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
