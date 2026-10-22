import express from "express";
import { getSettings, updateSessionTerm } from "../controllers/settingsController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin API routes
router.get("/settings", protect, getSettings);
router.post("/settings/session-term", protect, updateSessionTerm);

export default router;
