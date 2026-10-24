import Student from "../models/studentModel.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// @desc Add new student with profile photo
// @route POST /api/students
export const addStudent = async (req, res) => {
  try {
    // 1. Defensive check: Ensure req.body is defined and is a valid object
    if (!req.body || typeof req.body !== "object" || Object.keys(req.body).length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "Request body is missing. Please provide student details via multipart/form-data or JSON." 
      });
    }

    const {
      name,
      classLevel,
      session,
      regNumber,
      gender,
      dateOfBirth,
      address,
      parentName,
      parentPhone,
      parentEmail
    } = req.body;

    // 2. Validate mandatory schema fields
    if (!name || !classLevel || !session || !regNumber || !gender) {
      return res.status(400).json({ 
        success: false,
        message: "All required fields must be provided: name, classLevel, session, regNumber, gender" 
      });
    }

    // 3. Teacher Scope Validation: If authenticated as a teacher with assigned classes, enforce class boundaries
    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
      if (!req.user.assignedClasses.includes(classLevel.trim())) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You are only authorized to register students for classes: ${req.user.assignedClasses.join(", ")}. Received: ${classLevel.trim()}`
        });
      }
    }

    // 4. Mongoose query: Check if student with this regNumber already exists to prevent duplicate key errors
    const existing = await Student.findOne({ regNumber: regNumber.trim() });
    if (existing) {
      return res.status(400).json({ 
        success: false,
        message: "Registration Number already exists" 
      });
    }

    // 5. Resolve profile picture URL:
    //    - Check req.file.secure_url (direct Cloudinary storage)
    //    - Check req.file.path (multer-storage-cloudinary or pre-uploaded URL)
    //    - Check req.file.url
    //    - Check req.file.buffer (Multer memoryStorage streamed via uploadToCloudinary)
    //    - Fall back to req.body.profilePhoto if passed as text URL
    let profilePhotoUrl = req.body.profilePhoto || null;
    if (req.file) {
      if (req.file.secure_url) {
        profilePhotoUrl = req.file.secure_url;
      } else if (req.file.path) {
        profilePhotoUrl = req.file.path;
      } else if (req.file.url) {
        profilePhotoUrl = req.file.url;
      } else if (req.file.buffer) {
        try {
          const uploadRes = await uploadToCloudinary(req.file.buffer, "students");
          profilePhotoUrl = uploadRes.secure_url || uploadRes.url || null;
        } catch (uploadErr) {
          console.error("Cloudinary upload failed:", uploadErr.message);
          return res.status(502).json({
            success: false,
            message: `Cloudinary photo upload failed: ${uploadErr.message}`
          });
        }
      }
    }

    // 6. Mongoose query: Create and persist new student record in MongoDB
    const student = await Student.create({
      name: name.trim(),
      classLevel: classLevel.trim(),
      session: session.trim(),
      regNumber: regNumber.trim(),
      gender,
      dateOfBirth: dateOfBirth || null,
      address: address ? address.trim() : "",
      parentName: parentName ? parentName.trim() : "",
      parentPhone: parentPhone ? parentPhone.trim() : "",
      parentEmail: parentEmail ? parentEmail.trim().toLowerCase() : "",
      profilePhoto: profilePhotoUrl,
    });

    return res.status(201).json({
      success: true,
      message: "Student created successfully",
      student
    });

  } catch (error) {
    console.error("Error in addStudent:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message || "Failed to create student" 
    });
  }
};


// @desc Get all students
// @route GET /api/students
export const getStudents = async (req, res) => {
  try {
    // Mongoose query: Find all students (scoped to teacher's assigned classes if teacher has class restrictions)
    let query = {};
    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
      query.classLevel = { $in: req.user.assignedClasses };
    }

    const students = await Student.find(query).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: students.length,
      students
    });
  } catch (error) {
    console.error("Error in getStudents:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message || "Failed to retrieve students" 
    });
  }
};


// @desc Update student
// @route PUT /api/students/:id
export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Defensive check: Ensure req.body is defined
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ 
        success: false,
        message: "Request body is missing or invalid" 
      });
    }

    // 2. Teacher Scope Validation: If authenticated as a teacher with assigned classes, verify authority over target student
    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
      // Mongoose query: Check existing student's classLevel
      const studentToUpdate = await Student.findById(id);
      if (!studentToUpdate) {
        return res.status(404).json({ success: false, message: "Student not found" });
      }
      if (!req.user.assignedClasses.includes(studentToUpdate.classLevel)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You are only authorized to update students in classes: ${req.user.assignedClasses.join(", ")}. Student is in ${studentToUpdate.classLevel}.`
        });
      }
      if (req.body.classLevel && !req.user.assignedClasses.includes(req.body.classLevel.trim())) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Cannot reassign student to class ${req.body.classLevel.trim()} outside your assigned classes: ${req.user.assignedClasses.join(", ")}.`
        });
      }
    }

    let updateData = { ...req.body };

    // 2. Map profile photo from upload (path, secure_url, or buffer stream)
    if (req.file) {
      if (req.file.secure_url) {
        updateData.profilePhoto = req.file.secure_url;
      } else if (req.file.path) {
        updateData.profilePhoto = req.file.path;
      } else if (req.file.url) {
        updateData.profilePhoto = req.file.url;
      } else if (req.file.buffer) {
        try {
          const uploadRes = await uploadToCloudinary(req.file.buffer, "students");
          updateData.profilePhoto = uploadRes.secure_url || uploadRes.url || null;
        } catch (uploadErr) {
          console.error("Cloudinary upload failed on update:", uploadErr.message);
          return res.status(502).json({
            success: false,
            message: `Cloudinary photo upload failed: ${uploadErr.message}`
          });
        }
      }
    }

    // 3. Handle explicit removal of profile photo
    if (req.body.removePhoto === "true" || req.body.removePhoto === true) {
      updateData.profilePhoto = null;
    }

    // 4. Mongoose query: Find student by ID and update fields with validators enabled
    const updated = await Student.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!updated) {
      return res.status(404).json({ 
        success: false,
        message: "Student not found" 
      });
    }

    return res.status(200).json({
      success: true,
      message: "Student updated successfully",
      student: updated
    });

  } catch (error) {
    console.error("Error in updateStudent:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message || "Failed to update student" 
    });
  }
};


// @desc Delete student
// @route DELETE /api/students/:id
export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // Mongoose query: Find student by MongoDB ObjectId and remove document
    const deleted = await Student.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ 
        success: false,
        message: "Student not found" 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: "Student removed successfully" 
    });
  } catch (error) {
    console.error("Error in deleteStudent:", error);
    return res.status(500).json({ 
      success: false,
      message: error.message || "Failed to delete student" 
    });
  }
};
