import type { Handler } from "@netlify/functions";
import { getDb } from "../../src/db";
import { jsonResponse } from "../../src/utils";

export const handler: Handler = async () => {
  const start = Date.now();

  try {
    const db = getDb();
    await db.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;

    return jsonResponse(200, {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.COMMIT_REF ?? "local",
      db: { connected: true, latencyMs: dbLatency },
    });
  } catch {
    return jsonResponse(503, {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      db: { connected: false },
    });
  }
};
