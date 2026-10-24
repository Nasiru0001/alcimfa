import express from "express";
import { 
  uploadResult, 
  updateResult, 
  getStudentResult, 
  renderResultCard 
} from "../controllers/resultController.js";
import { protect, protectAdminOrTeacher } from "../middleware/authMiddleware.js";
import Result from "../models/resultModel.js";

const router = express.Router();

// ==========================================
// RESULT & SCORE ROUTES
// Teachers & Admins can upload and update scores
// ==========================================
router.post("/", protectAdminOrTeacher, uploadResult);
router.put("/:id", protectAdminOrTeacher, updateResult);
router.get("/card/:studentId", renderResultCard);  // Specific route FIRST
router.get("/:studentId", getStudentResult);       // Dynamic route LAST

// ==========================================
// DELETE RESULT ENDPOINT
// ==========================================
router.delete("/:id", protect, async (req, res) => {
  try {
    const resultId = req.params.id;
    
    console.log('🗑️ Attempting to delete result:', resultId);
    
    // Find the result first
    const result = await Result.findById(resultId);
    if (!result) {
      return res.status(404).json({ 
        success: false,
        message: "Result not found" 
      });
    }
    
    // Delete the result
    await Result.findByIdAndDelete(resultId);
    
    console.log(`✅ Successfully deleted result ID: ${resultId}`);
    
    res.json({ 
      success: true,
      message: "Result deleted successfully" 
    });
    
  } catch (error) {
    console.error("❌ Delete result error:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to delete result: " + error.message 
    });
  }
});

// ==========================================
// OPTION 3: PUBLIC WITH OPTIONAL AUTH
// Public access, but validates token if provided
// ==========================================
// router.post("/", protect, uploadResult);                      // ✅ Admin only
// router.get("/:studentId", publicOrProtect, getStudentResult); // 🔓 Public or Authenticated
// router.get("/card/:studentId", publicOrProtect, renderResultCard); // 🔓 Public or Authenticated

export default router;
