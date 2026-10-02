import { isMongoConnected } from "../config/db.js";
import { Message, MessageStatus } from "../models/Message.js";
import * as fileStore from "../store/fileStore.js";
import { sendNotification, MailResult, MessageForMail } from "./mailer.js";

const COLLECTION = "messages";

export interface NewMessage extends MessageForMail {
  userAgent: string;
  ip: string;
}

// a `type` rather than an `interface` so it satisfies Record<string, unknown>
// and can be handed straight to the generic file store helpers
export type StoredMessage = {
  _id: string;
  name: string;
  email: string;
  topic: string;
  company: string;
  message: string;
  source: string;
  userAgent: string;
  ip: string;
  status: MessageStatus;
  emailSent: boolean;
  emailError: string;
  createdAt: string;
  updatedAt: string;
};

export async function saveMessage(
  data: NewMessage
): Promise<{ stored: StoredMessage; mail: MailResult }> {
  // 1. store first, so a slow or broken SMTP server can never lose a message
  const stored: StoredMessage = isMongoConnected()
    ? ((await new Message(data).save()) as unknown as StoredMessage)
    : ((await fileStore.save<Record<string, unknown>>(COLLECTION, {
        ...data,
        status: "new",
        emailSent: false,
        emailError: "",
      })) as unknown as StoredMessage);

  // 2. then try to notify
  const mail = await sendNotification(data);

  // 3. record the delivery outcome for the admin inbox
  await setDelivery(stored._id, mail);

  return { stored, mail };
}

async function setDelivery(id: string, mail: MailResult): Promise<void> {
  const update = {
    emailSent: mail.sent,
    emailError: mail.skipped ? "smtp not configured" : mail.error || "",
  };
  if (isMongoConnected()) {
    await Message.findByIdAndUpdate(id, { ...update, updatedAt: new Date() });
    return;
  }
  await fileStore.updateOne(COLLECTION, id, update as Record<string, unknown>);
}

export async function getMessages(options?: {
  status?: MessageStatus;
  limit?: number;
  skip?: number;
}): Promise<{ items: StoredMessage[]; total: number }> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const skip = Math.max(options?.skip ?? 0, 0);
  const filter = options?.status ? { status: options.status } : {};

  if (isMongoConnected()) {
    const [items, total] = await Promise.all([
      Message.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Message.countDocuments(filter),
    ]);
    return { items: items as unknown as StoredMessage[], total };
  }

  const all = fileStore
    .findAll<StoredMessage>(COLLECTION)
    .filter((doc) => (options?.status ? doc.status === options.status : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { items: all.slice(skip, skip + limit), total: all.length };
}

export async function updateMessageStatus(
  id: string,
  status: MessageStatus
): Promise<StoredMessage | undefined> {
  if (isMongoConnected()) {
    const updated = await Message.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );
    return (updated as unknown as StoredMessage) ?? undefined;
  }
  return fileStore.updateOne<StoredMessage>(COLLECTION, id, {
    status,
  } as Partial<StoredMessage>);
}

export async function countMessages(): Promise<number> {
  if (isMongoConnected()) {
    return Message.countDocuments();
  }
  return fileStore.countAll(COLLECTION);
}
