import { createCaptchaChallenge, verifyCaptcha } from "./captcha.service.js";

// Issue a fresh CAPTCHA challenge (signed token + SVG image data URI).
export const getCaptcha = (req, res) => {
    try {
        const challenge = createCaptchaChallenge();
        return res.json({
            captchaToken: challenge.token,
            image: challenge.image,
            expiresIn: challenge.expiresIn,
        });
    } catch (error) {
        console.error("Captcha generation error:", error.message);
        return res.status(500).json({ message: "Failed to generate captcha" });
    }
};

// Middleware: require a valid CAPTCHA before continuing to the route handler.
export const requireCaptcha = (req, res, next) => {
    const token = req.body?.captchaToken;
    const text = req.body?.captchaText;

    const result = verifyCaptcha(token, text);

    if (!result.ok) {
        const message = result.reason === "expired"
            ? "Captcha expired. Please refresh and try again."
            : "Incorrect captcha. Please try again.";
        return res.status(400).json({ message, captchaError: true, reason: result.reason });
    }

    return next();
};
