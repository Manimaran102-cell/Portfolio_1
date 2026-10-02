import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import config from "../config/index.js";

export interface AuthRequest extends Request {
  user?: { email: string; role: string };
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "No token provided" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);
  try {
    req.user = jwt.verify(token, config.jwtSecret) as {
      email: string;
      role: string;
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}
