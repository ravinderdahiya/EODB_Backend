import crypto from "crypto";

// Self-hosted, stateless CAPTCHA.
// The challenge answer is never stored server-side and never sent to the client
// in plaintext. Instead we issue an HMAC-signed token that binds the answer,
// an expiry, and a random nonce. Verification recomputes the HMAC from the
// user-entered text, so no shared storage/DB is required (works across instances).

const CAPTCHA_TTL_MS = Number(process.env.CAPTCHA_TTL_MS || 5 * 60 * 1000); // 5 minutes
const CAPTCHA_LENGTH = Number(process.env.CAPTCHA_LENGTH || 5);

// Avoid visually ambiguous characters (0/O, 1/I/L, etc.).
const CHARSET = "abcdefghjkmnpqrstuvwxyz23456789";

const getSecret = () => (
    process.env.CAPTCHA_SECRET
    || process.env.SESSION_SECRET
    || process.env.JWT_SECRET
    || "insecure-default-captcha-secret-change-me"
);

const normalizeAnswer = (value) => String(value || "").trim().toLowerCase();

const generateCaptchaText = (length = CAPTCHA_LENGTH) => {
    const bytes = crypto.randomBytes(length);
    let text = "";
    for (let i = 0; i < length; i += 1) {
        text += CHARSET[bytes[i] % CHARSET.length];
    }
    return text;
};

const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const escapeXml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// Render a noisy, distorted SVG so the text is hard for naive OCR/bots.
const renderCaptchaSvg = (text) => {
    const width = 180;
    const height = 60;
    const charCount = text.length;
    const step = width / (charCount + 1);

    const palette = ["#1f6f43", "#15803d", "#0f5132", "#166534", "#1d4ed8", "#7c2d12"];

    const noiseLines = Array.from({ length: 6 }, () => {
        const x1 = randomInt(0, width);
        const y1 = randomInt(0, height);
        const x2 = randomInt(0, width);
        const y2 = randomInt(0, height);
        const stroke = palette[randomInt(0, palette.length - 1)];
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1" opacity="0.35" />`;
    }).join("");

    const noiseDots = Array.from({ length: 40 }, () => {
        const cx = randomInt(0, width);
        const cy = randomInt(0, height);
        const r = randomInt(1, 2);
        const fill = palette[randomInt(0, palette.length - 1)];
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="0.3" />`;
    }).join("");

    const chars = text.split("").map((char, index) => {
        const x = step * (index + 1);
        const y = randomInt(38, 46);
        const rotation = randomInt(-28, 28);
        const fontSize = randomInt(28, 36);
        const fill = palette[randomInt(0, palette.length - 1)];
        return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="'Courier New', monospace" font-weight="700" fill="${fill}" text-anchor="middle" transform="rotate(${rotation} ${x} ${y})">${escapeXml(char)}</text>`;
    }).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="captcha">`
        + `<rect width="${width}" height="${height}" fill="#f1f5f9" rx="8" />`
        + noiseLines
        + chars
        + noiseDots
        + `</svg>`;
};

const signCaptcha = (answer) => {
    const expiresAt = Date.now() + CAPTCHA_TTL_MS;
    const nonce = crypto.randomBytes(9).toString("hex");
    const data = `${normalizeAnswer(answer)}|${expiresAt}|${nonce}`;
    const signature = crypto.createHmac("sha256", getSecret()).update(data).digest("hex");
    const token = `${expiresAt}|${nonce}|${signature}`;
    return Buffer.from(token, "utf8").toString("base64url");
};

// Returns { ok: boolean, reason?: string }
const verifyCaptcha = (token, userInput) => {
    if (!token || !userInput) {
        return { ok: false, reason: "missing" };
    }

    let decoded;
    try {
        decoded = Buffer.from(String(token), "base64url").toString("utf8");
    } catch {
        return { ok: false, reason: "malformed" };
    }

    const parts = decoded.split("|");
    if (parts.length !== 3) {
        return { ok: false, reason: "malformed" };
    }

    const [expiresAtRaw, nonce, signature] = parts;
    const expiresAt = Number(expiresAtRaw);

    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
        return { ok: false, reason: "expired" };
    }

    const data = `${normalizeAnswer(userInput)}|${expiresAt}|${nonce}`;
    const expectedSignature = crypto.createHmac("sha256", getSecret()).update(data).digest("hex");

    const provided = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return { ok: false, reason: "mismatch" };
    }

    return { ok: true };
};

export const createCaptchaChallenge = () => {
    const text = generateCaptchaText();
    const svg = renderCaptchaSvg(text);
    const token = signCaptcha(text);
    const image = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
    return { token, image, expiresIn: CAPTCHA_TTL_MS };
};

export { verifyCaptcha };
