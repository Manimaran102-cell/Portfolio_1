import express from "express";
import cors from "cors";
import config from "./config/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { globalLimiter } from "./middlewares/rateLimit.js";
import messageRoutes from "./routes/messages.js";
import authRoutes from "./routes/auth.js";

const app = express();

// Behind a proxy (Render/Railway/Fly) this makes req.ip the real client address,
// which the rate limiter depends on.
app.set("trust proxy", 1);
app.disable("x-powered-by");

app.use(
  cors({
    origin: (origin, callback) => {
      // same-origin / curl / server-to-server requests have no Origin header
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = config.allowedOrigins.some((entry) =>
        entry instanceof RegExp ? entry.test(origin) : entry === origin
      );
      if (allowed) {
        callback(null, true);
        return;
      }
      console.warn(`[cors] blocked origin: ${origin}`);
      callback(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
  })
);

// a contact message is a few hundred bytes; anything bigger is abuse
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(globalLimiter);

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "portfolio-api",
    emailEnabled: config.smtpEnabled,
    uptime: Math.round(process.uptime()),
  });
});

app.use("/api/messages", messageRoutes);
app.use("/api/auth", authRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

app.use(errorHandler);

export default app;
