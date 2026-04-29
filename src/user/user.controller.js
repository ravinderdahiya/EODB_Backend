import prisma from "../config/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"


// Get IP 
const getIP = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
};
// SIGNUP
export const signup = async (req, res) => {
  try {
    const { fullname, email, password, mobile } = req.body

    // basic validation
    if (!fullname || !email || !password || !mobile) {
      return res.status(400).json({ message: "All fields are required" })
    }

    const exist = await prisma.user.findUnique({
      where: { email }
    })

    if (exist) {
      return res.status(400).json({ message: "User already exists" })
    }

    const hash = await bcrypt.hash(password, 10)

    await prisma.user.create({
      data: {
        fullname,
        email,
        password: hash,
        mobile
      }
    })

    res.json({ message: "Signup successful" })

  } catch (error) {
    console.error("Signup Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}


// LOGIN

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    console.log(req.body)

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" })
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }




    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({ message: "Wrong password" })
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret",
      { expiresIn: "1d" }
    )

    const ip = getIP(req);

    req.session.user = {
      id: user.id,
      email: user.email,
      ip: ip
    };

    res.json({
      message: "Login success",
      token,
      user: {
        id: user.id,
        email: user.email,
        fullname: user.fullname,
        role: user.role
      }
    })

  } catch (error) {
    console.error("Login Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
export const logout = (req, res) => {
  // Clear session
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.status(500).json({ message: "Logout failed" });
    }
    
    // Clear client-side storage hints
    res.json({ 
      message: "Logout success",
      clearStorage: true
    });
  });
};

// ADMIN LOGIN (supports both admin and superadmin roles)
export const adminLogin = async (req, res) => {
  try {
    const { adminId, password } = req.body;

    if (!adminId || !password) {
      return res.status(400).json({ message: "Admin ID and password required" });
    }

    // Find admin user by email/adminId and role (admin or superadmin)
    const admin = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminId },
          { fullname: adminId }
        ],
        role: { in: ["admin", "superadmin"] }
      }
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(401).json({ message: "Wrong password" });
    }

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role
      },
      process.env.JWT_SECRET || process.env.AUTH_SECRET || "defaultsecret",
      { expiresIn: "1d" }
    );

    const ip = getIP(req);

    req.session.user = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      ip: ip
    };

    res.json({
      message: "Admin login success",
      token,
      user: {
        id: admin.id,
        email: admin.email,
        fullname: admin.fullname,
        role: admin.role
      }
    });

  } catch (error) {
    console.error("Admin Login Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getMe = (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
};