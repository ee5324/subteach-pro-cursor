import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const health = onRequest((req, res) => {
  logger.info("health check", { method: req.method, path: req.path });
  res.status(200).json({ ok: true, service: "functions" });
});
