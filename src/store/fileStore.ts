import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const DATA_DIR = path.join(process.cwd(), "data");

export function initStore(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getFilePath(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

function readCollection<T>(collection: string): T[] {
  const filePath = getFilePath(collection);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as T[];
  } catch (error) {
    // a half-written or hand-edited file must not take the API down
    console.error(
      `Could not parse ${collection}.json:`,
      (error as Error).message
    );
    return [];
  }
}

function writeCollection<T>(collection: string, data: T[]): void {
  const filePath = getFilePath(collection);
  // write to a sibling temp file then rename, so a crash mid-write cannot
  // leave a truncated messages.json behind
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/*
 * save() is a read-modify-write, so two submissions arriving at the same moment
 * could otherwise clobber each other and silently drop a message. Chaining
 * every write through one promise serialises them.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => undefined);
  return run;
}

export function save<T extends Record<string, unknown>>(
  collection: string,
  doc: T
): Promise<T & { _id: string; createdAt: string; updatedAt: string }> {
  return enqueue(() => {
    const now = new Date().toISOString();
    const newDoc = {
      ...doc,
      _id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };
    const docs = readCollection<T & { _id: string }>(collection);
    docs.push(newDoc as T & { _id: string });
    writeCollection(collection, docs);
    return newDoc as T & { _id: string; createdAt: string; updatedAt: string };
  });
}

export function findAll<T extends Record<string, unknown>>(
  collection: string,
  filter?: Partial<T>
): T[] {
  let docs = readCollection<T>(collection);
  if (filter) {
    docs = docs.filter((doc) =>
      Object.entries(filter).every(
        ([key, value]) => doc[key as keyof T] === value
      )
    );
  }
  return docs;
}

export function findById<T extends Record<string, unknown>>(
  collection: string,
  id: string
): T | undefined {
  const docs = readCollection<T>(collection);
  return docs.find((doc) => (doc as Record<string, unknown>)._id === id);
}

export function updateOne<T extends Record<string, unknown>>(
  collection: string,
  id: string,
  update: Partial<T>
): Promise<T | undefined> {
  return enqueue(() => {
    const docs = readCollection<Record<string, unknown>>(collection);
    const index = docs.findIndex((doc) => doc._id === id);
    if (index === -1) return undefined;
    docs[index] = {
      ...docs[index],
      ...update,
      updatedAt: new Date().toISOString(),
    };
    writeCollection(collection, docs);
    return docs[index] as T;
  });
}

export function countAll(collection: string): number {
  return readCollection(collection).length;
}
