import express from "express";
import session from "express-session";
import cors from "cors";
import dotenv from "dotenv";

import userRoutes from "./user/user.routes.js";
import otpRoutes from "./otp/otp.routes.js";

dotenv.config();

const app = express();

// ✅ Middlewares
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Session (IMPORTANT: before routes)
app.use(session({
  secret: "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60
  }
}));

// ✅ Routes
app.use("/user", userRoutes);
app.use("/otp", otpRoutes);

export default app;