import express from "express";
import {
  addStudent,
  getStudents,
  updateStudent,
  deleteStudent,
} from "../controllers/studentController.js";

import { protect } from "../middleware/authMiddleware.js";
import { upload } from "../config/cloudinary.js";

const router = express.Router();

// Middleware wrapper to handle Multer upload errors gracefully in JSON API format
const uploadStudentPhoto = (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || "File upload failed"
      });
    }
    // Defensive check: ensure req.body is defined even if empty
    if (!req.body) {
      req.body = {};
    }
    next();
  });
};

// ⭐ Add Student (with profile photo)
router.post(
  "/",
  protect,
  uploadStudentPhoto,
  addStudent
);

// ⭐ Get all students
router.get("/", protect, getStudents);

// ⭐ Update student (with profile photo replacement)
router.put(
  "/:id",
  protect,
  uploadStudentPhoto,
  updateStudent
);

// ⭐ Delete student
router.delete("/:id", protect, deleteStudent);

export default router;
