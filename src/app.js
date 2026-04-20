import express from "express";
import session from "express-session";
import cors from "cors";
import userRoutes from "./user/user.routes.js";

const app = express();

app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));

app.use("/user", userRoutes);

app.use(express.json());

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

export default app;