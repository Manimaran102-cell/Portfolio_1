import mongoose from "mongoose";

export const MESSAGE_STATUSES = ["new", "read", "replied", "archived"] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_TOPICS = [
  "Full-time role",
  "Freelance project",
  "Collaboration",
  "Something else",
] as const;

export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

const messageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
  topic: {
    type: String,
    required: true,
    enum: MESSAGE_TOPICS,
    default: "Something else",
  },
  company: { type: String, trim: true, maxlength: 120, default: "" },
  message: { type: String, required: true, trim: true, maxlength: 4000 },

  // where the visitor came from, useful for spotting which link is converting
  source: { type: String, trim: true, maxlength: 300, default: "" },
  userAgent: { type: String, trim: true, maxlength: 300, default: "" },
  ip: { type: String, trim: true, maxlength: 64, default: "" },

  status: {
    type: String,
    enum: MESSAGE_STATUSES,
    default: "new",
    index: true,
  },
  emailSent: { type: Boolean, default: false },
  emailError: { type: String, default: "" },

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

export const Message = mongoose.model("Message", messageSchema);
