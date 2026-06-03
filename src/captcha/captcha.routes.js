import express from "express";
import { getCaptcha } from "./captcha.controller.js";
import { captchaLimiter } from "../middleware/security.middleware.js";

const router = express.Router();

router.get("/new", captchaLimiter, getCaptcha);

export default router;
