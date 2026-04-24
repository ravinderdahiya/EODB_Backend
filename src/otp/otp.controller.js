import prisma from "../config/db.js";
import otpGenerator from "otp-generator";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { recordLoginAttempt, createLoginSession } from "../middleware/security.middleware.js";

dotenv.config();

// ✅ Helper function to normalize phone number
const normalizePhone = (phone) => {
  if (!phone) return null;
  // Remove all non-digit characters
  const digitsOnly = String(phone).replace(/\D/g, '');
  // Add +91 if it's 10 digits (India)
  if (digitsOnly.length === 10) {
    return `+91${digitsOnly}`;
  }
  // If it's 12 digits and starts with 91, add +
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return `+${digitsOnly}`;
  }
  // If it's 13 digits and starts with +91, return as is
  if (phone.startsWith('+91') && digitsOnly.length === 12) {
    return phone;
  }
  return phone; // Return as is if can't normalize
};

// ===================== SEND OTP WITH SMS =====================
export const sendOtp = async (req, res) => {
  try {
    let { phone, mobile } = req.body;
    
    // ✅ Accept both 'phone' and 'mobile' field names
    phone = phone || mobile;

    console.log("📱 Send OTP Request - Raw phone:", phone);

    if (!phone) {
      return res.status(400).json({ message: "Phone required" });
    }

    // ✅ Normalize phone number
    phone = normalizePhone(phone);
    console.log("📱 Send OTP Request - Normalized phone:", phone);

    if (!phone) {
      return res.status(400).json({ message: "Invalid phone format" });
    }

   /* const otp = otpGenerator.generate(6, {
      digits: true,
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });*/
   const otp = Math.floor(1000 + Math.random() * 9000); // 4 digit

    // ✅ Delete existing OTP for this phone (if any)
    await prisma.otp.deleteMany({
      where: { phone }
    });

    await prisma.otp.create({
      data: {
        phone,
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    console.log("✅ OTP Created:", { phone, otp, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });

    // ===================== SEND SMS VIA PIXABITS API =====================
    try {
      const message = `Your One Time Password is ${otp} for your EODB application. Don't share OTP with anyone. EODB`;
      
      const smsResponse = await axios.post(
        "https://sms.pixabits.in/smsapi/sms/custom/send",
        {
          "key": process.env.SMS_API_KEY || "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiI2OTc4ODkzZGE1OTFkNjVmNDZiMzQxYmM6Njk3ODg5M2RhNTkxZDY1ZjQ2YjM0MWJlOkhBUlNBQzo2NTJmYTQ0ZWYzMTc3NjdlOTdkYTMyNmYiLCJpYXQiOjE3Njk1MTA1NTV9.lqYYXdcDUada9lKBa07uJT2hNZzpWjr8D3QmTZzGP6M",
          "text": message,
          "senderId": process.env.SMS_SENDER_ID || "EODB",
          "tempDltId": process.env.SMS_TEMP_DLT_ID || "1407169838783023275",
          "route": "Domestic",
          "phoneno": phone,
          "groupIds": [" "],
          "trans": 1,
          "unicode": 0,
          "flash": false,
          "tiny": false
        }
      );

      console.log("📨 SMS API Response:", { status: smsResponse.status, data: smsResponse.data });
      
      res.json({ 
        message: "OTP sent successfully",
        phone,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
        smsSent: true,
        expiresIn: "5 minutes"
      });
    } catch (smsError) {
      console.error("❌ SMS API Error:", smsError.message);
      // Still return success if SMS fails, OTP is saved in DB
      res.json({ 
        message: "OTP created successfully (SMS delivery pending)",
        phone,
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
        smsSent: false,
        warning: "OTP saved but SMS delivery failed. Contact support.",
        expiresIn: "5 minutes"
      });
    }

  } catch (error) {
    console.error("❌ Send OTP Error:", error.message);
    console.error("Error Stack:", error.stack);
    res.status(500).json({ 
      message: "Server error",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};
// ✅ VERIFY OTP + LOGIN (JWT)
export const verifyOtp = async (req, res) => {
  try {
    let { phone, mobile, otp } = req.body;
    
    // ✅ Accept both 'phone' and 'mobile' field names
    phone = phone || mobile;

    console.log("🔐 Verify OTP Request - Raw:", { phone, otp, otpType: typeof otp });

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone and OTP required" });
    }

    // ✅ Normalize phone number
    phone = normalizePhone(phone);
    console.log("🔐 Verify OTP Request - Normalized phone:", phone);

    if (!phone) {
      return res.status(400).json({ message: "Invalid phone format" });
    }

    // ✅ Convert OTP to number (ensure type matching with DB)
    const otpNumber = Number(otp);
    if (isNaN(otpNumber)) {
      return res.status(400).json({ message: "OTP must be a number" });
    }

    console.log("🔐 Converted OTP:", { original: otp, converted: otpNumber });

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 10) {
      console.error("❌ JWT_SECRET not configured properly in .env");
      return res.status(500).json({ message: "Server configuration error: JWT_SECRET missing or too short" });
    }

    // ✅ Find OTP record
    console.log("🔍 Searching for OTP in database...");
    const record = await prisma.otp.findFirst({
      where: { 
        phone,
        otp: otpNumber
      }
    });

    console.log("🔍 OTP Record Found:", record ? "YES ✅" : "NO ❌", record);

    if (!record) {
      console.log("❌ OTP Mismatch - Phone:", phone, "OTP:", otpNumber);
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // ✅ Check OTP expiration
    const now = new Date();
    const expiresAt = new Date(record.expiresAt);
    console.log("⏰ OTP Expiration Check - Current:", now.toISOString(), "Expires:", expiresAt.toISOString());

    if (expiresAt < now) {
      console.log("❌ OTP Expired");
      return res.status(400).json({ message: "OTP expired" });
    }

    // ✅ Check if user exists
    console.log("👤 Looking up user with mobile:", phone);
    let user = await prisma.user.findFirst({
      where: { mobile: phone }
    });

    console.log("👤 User Found:", user ? "YES ✅" : "NO (will create new)" , user?.id);

    // ✅ Create user if not exists
    if (!user) {
      console.log("➕ Creating new user...");
      user = await prisma.user.create({
        data: { 
          mobile: phone,
          fullname: "User",
          email: `user_${Date.now()}@eodb.com`,
          password: "default_password"
        }
      });
      console.log("➕ New User Created:", user.id);
    }

    // ✅ Generate JWT Token
    console.log("🔑 Generating JWT Token...");
    const token = jwt.sign(
      { id: user.id, mobile: user.mobile },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    console.log("🔑 JWT Token Generated Successfully");

    // ✅ Delete OTP after success
    console.log("🗑️  Deleting used OTP...");
    await prisma.otp.deleteMany({
      where: { phone }
    });
    console.log("🗑️  OTP deleted successfully");

    // ✅ Record successful login attempt
    console.log("📝 Recording login attempt...");
    await recordLoginAttempt(phone, true, req.clientIp, {
      ...req.geoLocation,
      userAgent: req.get("user-agent")
    });

    // ✅ Create login session with location tracking
    console.log("🔐 Creating login session...");
    const session = await createLoginSession(user.id, req.clientIp, {
      ...req.geoLocation,
      userAgent: req.get("user-agent")
    });

    console.log("✅ Login completed successfully");

    res.json({
      message: "OTP verified successfully",
      token,
      session: session?.id,
      user: {
        id: user.id,
        mobile: user.mobile,
        email: user.email,
        lastLogin: {
          ip: req.clientIp,
          latitude: req.geoLocation?.latitude,
          longitude: req.geoLocation?.longitude,
          city: req.geoLocation?.city,
          country: req.geoLocation?.country,
        }
      }
    });

  } catch (error) {
    console.error("❌ Verify OTP Error:", error.message);
    console.error("Error Stack:", error.stack);
    res.status(500).json({ 
      message: "Server error",
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};