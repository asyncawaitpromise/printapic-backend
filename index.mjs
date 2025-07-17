import dotenv from 'dotenv';
import express from 'express';

dotenv.config({ path: `.env.local` })

const app = express();

// Built-in middleware
app.use(express.json());

app.get("/", (req, res) => {
    res.send("v1.0.0");
});

// Health-check
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// --- Authenticated routes ---
import { requireAuth } from "./middlewares/requireAuth.mjs";

app.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
