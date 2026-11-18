import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { availabilityRouter } from "./routes/availability.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/availability", availabilityRouter);

  return app;
}
