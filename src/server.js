import dotenv from "dotenv";
import app from "./app.js";

dotenv.config();

app.listen(8080, () => {
  console.log("Server running on 8080");
});