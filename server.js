import express from "express";
import dotenv from "dotenv";
import handler from "./api/recommendations.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config( {path: "./.env" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// endpoint
app.post("/api/recommendations", (req, res) => {
    handler(req, res);
});

app.listen(3000, () => {
    console.log("Backend running on http://localhost:3000");
});
