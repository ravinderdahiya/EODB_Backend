import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient({
  errorFormat: "pretty",
  log: ["warn", "error"],
})

export default prisma