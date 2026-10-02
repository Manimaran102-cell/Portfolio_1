import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: Error & { type?: string; status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // body-parser failures arrive before any route runs, so handle them first
  if (err.type === "entity.too.large") {
    res.status(413).json({
      success: false,
      error: "Message is too large to send",
    });
    return;
  }

  if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    res.status(400).json({ success: false, error: "Malformed request body" });
    return;
  }

  console.error("Error:", err.message);

  if (err.name === "ValidationError") {
    const messages = Object.values((err as any).errors).map(
      (e: any) => e.message
    );
    res.status(400).json({ success: false, error: messages.join(", ") });
    return;
  }

  if (err.name === "CastError") {
    res.status(400).json({ success: false, error: "Invalid ID format" });
    return;
  }

  // never leak internals of a public endpoint to the visitor
  res.status(500).json({ success: false, error: "Something went wrong" });
}
