import dotenv from "dotenv";
dotenv.config();

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const isProduction = process.env.NODE_ENV === "production";

/** Origins allowed to submit the public contact form. */
const allowedOrigins = [
  ...splitList(process.env.ALLOWED_ORIGINS),
  "https://manimaran102-cell.github.io",
  // localhost on any port, for development
  ...(isProduction ? [] : [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]),
  // "null" is the origin Chrome reports for a page opened from disk (file://)
  "null",
];

const smtp = {
  host: process.env.SMTP_HOST || "",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.MAIL_FROM || "Portfolio <no-reply@example.com>",
  to: process.env.CONTACT_TO || process.env.SMTP_USER || "",
};

/** Email only works once a host, credentials and a recipient are all present. */
const smtpEnabled = Boolean(
  smtp.host && smtp.user && smtp.pass && smtp.to
);

const config = {
  env: process.env.NODE_ENV || "development",
  isProduction,
  port: parseInt(process.env.PORT || "5000", 10),

  // Accept both spellings. A typo here used to degrade silently: the server
  // booted fine and wrote every message to a local file while the owner
  // believed the messages were going to Atlas.
  mongodbUri: (process.env.MONGODB_URI || process.env.MONGODB_URL || "").trim(),

  allowedOrigins,

  smtp,
  smtpEnabled,

  admin: {
    email: (process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || "",
  },

  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
};

/**
 * In production a missing or default JWT secret would let anyone mint an admin
 * token, so refuse to boot rather than expose the inbox.
 */
const insecureSecrets = new Set([
  "",
  "change-this-to-a-secure-random-string",
  "default-secret-change-this",
]);

if (isProduction && insecureSecrets.has(config.jwtSecret)) {
  throw new Error(
    "JWT_SECRET must be set to a unique random value when NODE_ENV=production"
  );
}
if (config.jwtSecret === "") {
  config.jwtSecret = "portfolio-api-dev-secret-do-not-use-in-production";
}

export default config;
