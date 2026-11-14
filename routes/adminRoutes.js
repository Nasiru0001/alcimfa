import express from "express";
import { getSettings, updateSessionTerm } from "../controllers/settingsController.js";
import { assignTeacherSubjects } from "../controllers/userController.js";
import { loginStaff } from "../controllers/authController.js";
import { protect, protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Staff Login API (Admin & Teacher)
router.post("/login", loginStaff);

// Admin API routes
router.get("/settings", protect, getSettings);
router.post("/settings/session-term", protect, updateSessionTerm);

// Teacher Subject Assignment
router.patch("/teachers/:id/assign-subjects", protectAdmin, assignTeacherSubjects);
router.put("/teachers/:id/assign-subjects", protectAdmin, assignTeacherSubjects);

export default router;
