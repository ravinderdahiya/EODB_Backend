import express from "express"
import dotenv from "dotenv"
import userRoutes from "./user/user.routes.js"

dotenv.config()

const app = express()

app.use(express.json())

app.use("/user", userRoutes)

app.listen(5000, () => {
  console.log("Server running on 5000")
})