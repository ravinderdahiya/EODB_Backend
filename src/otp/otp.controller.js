import prisma from "../config/db.js";
import otpGenerator from "otp-generator";



export const sendOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone required" });
    }

   /* const otp = otpGenerator.generate(6, {
      digits: true,
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });*/
    const otp = Math.floor(100000 + Math.random() * 900000); // 6 digit number

    await prisma.otp.create({
      data: {
        phone,
        otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    console.log("OTP:", otp);

    res.json({ message: "OTP sent" });

  } catch (error) {
    console.error("Send OTP Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
// ✅ VERIFY OTP + LOGIN (JWT)
export const verifyOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone and OTP required" });
    }

    const record = await prisma.otp.findFirst({
      where: { phone, otp }
    });

    if (!record) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    // ✅ Check if user exists
    let user = await prisma.user.findUnique({
      where: { phone }
    });

    // ✅ Create user if not exists
    if (!user) {
      user = await prisma.user.create({
        data: { phone }
      });
    }

    // ✅ Generate JWT Token
    const token = jwt.sign(
      { id: user.id, phone: user.phone },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // ✅ Delete OTP after success
    await prisma.otp.deleteMany({
      where: { phone }
    });

    res.json({
      message: "OTP verified",
      token,
      user
    });

  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};