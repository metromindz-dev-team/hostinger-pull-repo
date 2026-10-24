import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import storeRoutes from "./routes/store.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import { errorHandler } from "./middleware/validate.js";
const app = express();
// Banner and product image forms may submit a 5 MB image as Base64, which expands in JSON.
app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use(morgan("dev"));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/v1/content", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  next();
});
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1", storeRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use((_req, _res, next) =>
  next(Object.assign(new Error("Route not found"), { status: 404 })),
);
app.use(errorHandler);
export default app;
