import prisma from "../config/db.js"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

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
      process.env.AUTH_SECRET,
      { expiresIn: "1d" }
    )

    res.json({
      message: "Login success",
      token
    })

  } catch (error) {
    console.error("Login Error:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}