import express from "express"
import dotenv from "dotenv"
import userRoutes from "./user/user.routes.js"
import app from "./app.js";

dotenv.config()

const app = express()

app.use(express.json())

app.use("/user", userRoutes)

app.listen(8080, () => {
  console.log("Server running on 8080")
})