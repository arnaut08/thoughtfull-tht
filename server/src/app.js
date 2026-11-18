import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { availabilityRouter } from "./routes/availability.js";
import { bookingsRouter, professionalBookingsRouter } from "./routes/bookings.js";
import { professionalsRouter } from "./routes/professionals.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173" }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/availability", availabilityRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/professional-bookings", professionalBookingsRouter);
  app.use("/api/professionals", professionalsRouter);

  return app;
}
