import { body, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";
import { MESSAGE_TOPICS } from "../models/Message.js";

/*
 * Kept in step with the HTML in the portfolio so the browser and the API agree
 * on what a valid submission looks like. The frontend mirrors these limits for
 * instant feedback; this is the copy that actually protects the server.
 */
export const MESSAGE_LIMITS = {
  name: { min: 2, max: 80 },
  email: { max: 160 },
  company: { max: 120 },
  message: { min: 10, max: 4000 },
} as const;

export const validateMessage = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: MESSAGE_LIMITS.name.min, max: MESSAGE_LIMITS.name.max })
    .withMessage(
      `Name must be between ${MESSAGE_LIMITS.name.min} and ${MESSAGE_LIMITS.name.max} characters`
    ),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isLength({ max: MESSAGE_LIMITS.email.max })
    .withMessage("Email is too long")
    .bail()
    .isEmail()
    .withMessage("Enter a valid email address"),

  body("topic")
    .trim()
    .notEmpty()
    .withMessage("Pick a topic")
    .bail()
    .isIn([...MESSAGE_TOPICS])
    .withMessage("Unknown topic"),

  body("company")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: MESSAGE_LIMITS.company.max })
    .withMessage("Company name is too long"),

  body("message")
    .trim()
    .notEmpty()
    .withMessage("Message is required")
    .isLength({
      min: MESSAGE_LIMITS.message.min,
      max: MESSAGE_LIMITS.message.max,
    })
    .withMessage(
      `Message must be between ${MESSAGE_LIMITS.message.min} and ${MESSAGE_LIMITS.message.max} characters`
    ),
];

export function handleValidation(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      error: errors.array().map((e) => e.msg),
    });
    return;
  }
  next();
}
