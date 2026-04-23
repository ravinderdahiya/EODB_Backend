import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

// ✅ Test Route (YAHAN ADD KARO)
app.get("/", (req, res) => {
  res.send("API working ✅");
});
const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});