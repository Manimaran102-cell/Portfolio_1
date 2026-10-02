import { Router, Request, Response } from "express";
import config from "../config/index.js";
import { authMiddleware } from "../middlewares/auth.js";
import { honeypot } from "../middlewares/antiSpam.js";
import { contactLimiter } from "../middlewares/rateLimit.js";
import {
  validateMessage,
  handleValidation,
  MESSAGE_LIMITS,
} from "../middlewares/validate.js";
import {
  MESSAGE_STATUSES,
  MESSAGE_TOPICS,
  MessageStatus,
} from "../models/Message.js";
import {
  saveMessage,
  getMessages,
  updateMessageStatus,
  countMessages,
} from "../services/messageService.js";

const router = Router();

/**
 * Lets the form mirror the server's own limits and topic list, so the two can
 * never drift apart.
 */
router.get("/meta", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      topics: MESSAGE_TOPICS,
      limits: MESSAGE_LIMITS,
      emailEnabled: config.smtpEnabled,
    },
  });
});

/** Public submission endpoint. */
router.post(
  "/",
  contactLimiter,
  validateMessage,
  handleValidation,
  honeypot,
  async (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, string | undefined>;

      const { stored, mail } = await saveMessage({
        name: (body.name || "").trim(),
        email: (body.email || "").trim().toLowerCase(),
        topic: (body.topic || "Something else").trim(),
        company: (body.company || "").trim(),
        message: (body.message || "").trim(),
        source: (body.source || "").slice(0, 300),
        userAgent: (req.get("user-agent") || "").slice(0, 300),
        ip: (req.ip || "").slice(0, 64),
      });

      if (mail.skipped) {
        console.log(
          `[contact] stored, no SMTP configured: ${stored.name} <${stored.email}>`
        );
      } else if (mail.sent) {
        console.log(`[contact] stored + emailed: ${stored.email}`);
      } else {
        console.log(
          `[contact] stored, email FAILED: ${stored.email} (${mail.error})`
        );
      }

      res.status(201).json({
        success: true,
        data: { id: stored._id, status: "received", createdAt: stored.createdAt },
      });
    } catch (error) {
      console.error("Contact submission failed:", (error as Error).message);
      res.status(500).json({
        success: false,
        error: "Could not save your message. Please email me directly instead.",
      });
    }
  }
);

/** Reads a query-string value that may legitimately arrive as string[]. */
function queryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/** Stored-message inbox. */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const status = queryValue(req.query.status);
    const limit = queryValue(req.query.limit);
    const skip = queryValue(req.query.skip);
    const result = await getMessages({
      status:
        status && MESSAGE_STATUSES.includes(status as MessageStatus)
          ? (status as MessageStatus)
          : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Could not list messages:", (error as Error).message);
    res.status(500).json({ success: false, error: "Could not list messages" });
  }
});

router.get("/count", authMiddleware, async (_req: Request, res: Response) => {
  res.json({ success: true, data: { total: await countMessages() } });
});

router.patch("/:id", authMiddleware, async (req: Request, res: Response) => {
  const { status } = (req.body || {}) as { status?: string };
  if (!status || !MESSAGE_STATUSES.includes(status as MessageStatus)) {
    res.status(400).json({
      success: false,
      error: `status must be one of: ${MESSAGE_STATUSES.join(", ")}`,
    });
    return;
  }
  try {
    const updated = await updateMessageStatus(
      String(req.params.id),
      status as MessageStatus
    );
    if (!updated) {
      res.status(404).json({ success: false, error: "Message not found" });
      return;
    }
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error("Could not update message:", (error as Error).message);
    res
      .status(500)
      .json({ success: false, error: "Could not update message" });
  }
});

export default router;
