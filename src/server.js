import express from "express"
import dotenv from "dotenv"
import userRoutes from "./user/user.routes.js"
import app from "./app.js";
import otpRoutes from "./otp/otp.routes.js"; 

dotenv.config()

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/user", userRoutes)
app.use("/otp", otpRoutes) // ✅ UNCOMMENT
app.listen(8080, () => {
  console.log("Server running on 8080")
})