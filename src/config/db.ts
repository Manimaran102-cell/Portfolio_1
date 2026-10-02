import mongoose from "mongoose";
import config from "./index.js";

let mongoConnected = false;

export async function connectMongo(): Promise<void> {
  if (!config.mongodbUri) {
    if (config.isProduction) {
      // Losing every enquiry because of a missing variable is not acceptable
      // in production, where the file store also dies on redeploy.
      throw new Error(
        "MONGODB_URI is not set. In production the API refuses to start " +
          "without a database, because messages stored to a local file are " +
          "lost on every redeploy."
      );
    }
    console.log("MONGODB_URI not set, using file-based storage (development only)");
    return;
  }
  try {
    await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 5000 });
    mongoConnected = true;
    console.log("Connected to MongoDB");
  } catch (error) {
    if (config.isProduction) {
      throw new Error(
        "Could not reach MongoDB, and file storage is not allowed in " +
          `production: ${(error as Error).message}`
      );
    }
    console.error("MongoDB connection error:", (error as Error).message);
    console.log("Falling back to file-based storage");
  }
}

export function isMongoConnected(): boolean {
  return mongoConnected && mongoose.connection.readyState === 1;
}

export function disconnectMongo(): Promise<void> {
  return mongoose.disconnect();
}
