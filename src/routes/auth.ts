import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import config from "../config/index.js";
import { verifyAdmin } from "../services/adminAuth.js";

const router = Router();

/**
 * Exchanges the ADMIN_EMAIL / ADMIN_PASSWORD pair for a short-lived token that
 * the stored-message endpoints require.
 */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = (req.body || {}) as {
    email?: string;
    password?: string;
  };

  if (!(await verifyAdmin({ email: email ?? "", password: password ?? "" }))) {
    res.status(401).json({ success: false, error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    { email: config.admin.email, role: "admin" },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
  );

  res.json({ success: true, data: { token } });
});

export default router;
