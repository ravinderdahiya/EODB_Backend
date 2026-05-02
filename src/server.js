import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

// ✅ Root test route
// IIS virtual directory /eodb_backend is stripped in app.js middleware,
// so this root route will work for https://hsac.org.in/eodb_backend
app.get("/", (req, res) => {
  res.send("API working ✅");
});

// ✅ Use IIS/iisnode assigned port if available, fallback to 8080
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "not set"}`);
});