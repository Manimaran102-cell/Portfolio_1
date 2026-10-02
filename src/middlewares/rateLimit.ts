import rateLimit from "express-rate-limit";
import config from "../config/index.js";

/**
 * A public POST endpoint on a personal site is a spam magnet. Two limits:
 * a tight one on the contact form itself, and a loose one across the API.
 *
 * The default key generator keys on the client IP and already collapses IPv6
 * into the correct /64 subnet, so no custom keying is needed.
 *
 * The in-memory store is per-process, which is correct for a single instance.
 * If this ever runs on more than one replica the limits become per-replica, so
 * swap in the Redis store described in the README.
 */

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: config.isProduction ? 5 : 50,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many messages sent. Please try again in a few minutes.",
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many messages sent. Please try again in a few minutes.",
    });
  },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 300 : 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: "Too many requests" },
  skip: (req) => req.path === "/api/health",
});

export { contactLimiter, globalLimiter };
