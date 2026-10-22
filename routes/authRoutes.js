import express from "express";
import { 
  loginAdmin, 
  logoutAdmin, 
  getAdminProfile,
  updateAdminProfile,
  changePassword,
  registerUser
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.post("/login", loginAdmin);

// Protected routes (authentication required)
router.post("/add-user", protect, registerUser);
router.post("/logout", protect, logoutAdmin);
router.get("/profile", protect, getAdminProfile);
router.put("/profile", protect, updateAdminProfile);
router.put("/change-password", protect, changePassword);

export default router;
