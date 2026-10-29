import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { FRONTEND_DIR } from "./config";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => !req.url?.startsWith("/api") || req.method === "GET" },
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cookieParser());
// Keep the raw body: Shopify and Meta webhook signatures are computed over it
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use("/api", (err: Error, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err: err.message }, "request failed");
  res.status(500).json({ error: err.message });
});

// Development: the live dashboard is the Vite dev server, never a stale build
if (process.env.NODE_ENV === "development") {
  const devUrl = process.env.DASHBOARD_DEV_URL ?? "http://localhost:5180";
  app.get(/^\/(?!api\/).*/, (req, res) => res.redirect(302, `${devUrl}${req.originalUrl}`));
}

// Production: serve the built dashboard from the same server.
// index.html is never cached (so a rebuild shows up on refresh); hashed assets are.
app.use(
  express.static(FRONTEND_DIR, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }),
);
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  // A missing file (old asset, typo) must 404, not return HTML the browser tries to run
  if (path.extname(req.path)) {
    res.status(404).end();
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(FRONTEND_DIR, "index.html"), (err) => {
    if (err) next();
  });
});

export default app;
