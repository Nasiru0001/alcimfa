import express from "express";
import {
  addStudent,
  getStudents,
  updateStudent,
  deleteStudent,
} from "../controllers/studentController.js";

import { protect, protectAdminOrTeacher } from "../middleware/authMiddleware.js";
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

// ⭐ Add Student (with profile photo) - Decentralized to Admins & Teachers
router.post(
  "/",
  protectAdminOrTeacher,
  uploadStudentPhoto,
  addStudent
);

// ⭐ Get all students - Admins & Teachers (scoped to assigned classes)
router.get("/", protectAdminOrTeacher, getStudents);

// ⭐ Update student (with profile photo replacement) - Admins & Teachers
router.put(
  "/:id",
  protectAdminOrTeacher,
  uploadStudentPhoto,
  updateStudent
);

// ⭐ Delete student - Admin only
router.delete("/:id", protect, deleteStudent);

export default router;
