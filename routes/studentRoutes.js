import express from "express";
import {
  addStudent,
  getStudents,
  getArchivedStudents,
  archiveStudent,
  unarchiveStudent,
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

// ⭐ Get all active students (excludes archived by default) - Admins & Teachers
router.get("/", protectAdminOrTeacher, getStudents);

// ⭐ Get all archived students - Admins & Teachers (Must be defined before parameterized /:id routes)
router.get("/archived", protectAdminOrTeacher, getArchivedStudents);

// ⭐ Archive student (soft delete) - Admins & Teachers
router.patch("/:id/archive", protectAdminOrTeacher, archiveStudent);

// ⭐ Restore / Unarchive student - Admins & Teachers
router.patch("/:id/unarchive", protectAdminOrTeacher, unarchiveStudent);

// ⭐ Update student (with profile photo replacement) - Admins & Teachers
router.put(
  "/:id",
  protectAdminOrTeacher,
  uploadStudentPhoto,
  updateStudent
);

// ⭐ Delete student permanently - Admin only
router.delete("/:id", protect, deleteStudent);

export default router;
