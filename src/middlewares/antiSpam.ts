import { Request, Response, NextFunction } from "express";

/**
 * Bot traps for the public contact endpoint.
 *
 * Both checks deliberately return the *same* 201 payload as a genuine
 * submission. A bot that receives an error learns it was detected and can adapt;
 * a bot that receives a success has no signal that the message was thrown away.
 */

/** Inputs filled in faster than a human could plausibly type. */
const MIN_FILL_MS = 2500;

export interface HoneypotVerdict {
  isBot: boolean;
  reason?: string;
}

export function detectBot(req: Request): HoneypotVerdict {
  const body = (req.body || {}) as Record<string, unknown>;

  // 1. hidden field a human never sees
  const trap = body.website;
  if (typeof trap === "string" && trap.trim() !== "") {
    return { isBot: true, reason: "honeypot filled" };
  }

  // 2. submitted implausibly quickly after the page rendered
  const startedAt = Number(body.formStartedAt);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const elapsed = Date.now() - startedAt;
    // a wildly wrong clock in the future is not a human either
    if (elapsed < MIN_FILL_MS) {
      return { isBot: true, reason: `filled in ${elapsed}ms` };
    }
  }

  return { isBot: false };
}

export function honeypot(req: Request, res: Response, next: NextFunction): void {
  const verdict = detectBot(req);
  if (!verdict.isBot) {
    next();
    return;
  }

  console.warn(`[contact] dropped submission (${verdict.reason})`);
  res.status(201).json({
    success: true,
    data: { id: null, status: "received" },
  });
}
