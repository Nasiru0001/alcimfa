import mongoose from "mongoose";
import Student from "../models/studentModel.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// Helper: Safely resolve Student document by either ObjectId or regNumber
export const findStudentByIdOrReg = async (identifier) => {
  if (!identifier || typeof identifier !== "string") return null;
  const trimmed = identifier.trim();

  // If valid 24-character hexadecimal ObjectId, query by _id first
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    // Mongoose query: Find student by MongoDB ObjectId
    const studentById = await Student.findById(trimmed);
    if (studentById) return studentById;
  }

  // Otherwise (or if not found by ObjectId), search by unique registration number
  // Mongoose query: Find student by registration number
  return await Student.findOne({ regNumber: trimmed });
};

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


// @desc Get all active students (excluding archived records by default)
// @route GET /api/students
export const getStudents = async (req, res) => {
  try {
    // Mongoose query: Exclude archived students by default
    let query = { isArchived: { $ne: true } };

    // Support optional query parameter ?includeArchived=true if caller explicitly requests both
    if (req.query.includeArchived === "true") {
      delete query.isArchived;
    }

    // Scoped to teacher's assigned classes if teacher has class restrictions
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


// @desc Get all archived students
// @route GET /api/students/archived
export const getArchivedStudents = async (req, res) => {
  try {
    // Mongoose query: Retrieve only records where isArchived is true
    let query = { isArchived: true };

    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
      query.classLevel = { $in: req.user.assignedClasses };
    }

    const students = await Student.find(query).sort({ archivedAt: -1, updatedAt: -1 });
    return res.status(200).json({
      success: true,
      count: students.length,
      students
    });
  } catch (error) {
    console.error("Error in getArchivedStudents:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve archived students"
    });
  }
};


// @desc Archive a student (soft delete)
// @route PATCH /api/students/:id/archive
export const archiveStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    // 1. Mongoose query: Locate student by ObjectId or regNumber
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 2. Teacher Scope Validation: Verify authority over student's class
    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
      if (!req.user.assignedClasses.includes(student.classLevel)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You are only authorized to manage students in classes: ${req.user.assignedClasses.join(", ")}. Student is in ${student.classLevel}.`
        });
      }
    }

    // 3. Mongoose query: Update student document to mark as archived
    student.isArchived = true;
    student.archivedAt = new Date();
    student.archiveReason = reason ? String(reason).trim() : "Graduated";
    await student.save();

    return res.status(200).json({
      success: true,
      message: `Student '${student.name}' (${student.regNumber}) archived successfully`,
      student
    });
  } catch (error) {
    console.error("Error in archiveStudent:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to archive student"
    });
  }
};


// @desc Restore / Unarchive a student
// @route PATCH /api/students/:id/unarchive
export const unarchiveStudent = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Mongoose query: Locate student by ObjectId or regNumber
    const student = await findStudentByIdOrReg(id);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 2. Teacher Scope Validation: Verify authority over student's class
    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
      if (!req.user.assignedClasses.includes(student.classLevel)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. You are only authorized to manage students in classes: ${req.user.assignedClasses.join(", ")}. Student is in ${student.classLevel}.`
        });
      }
    }

    // 3. Mongoose query: Restore student document to active status
    student.isArchived = false;
    student.archivedAt = null;
    student.archiveReason = null;
    await student.save();

    return res.status(200).json({
      success: true,
      message: `Student '${student.name}' (${student.regNumber}) restored/unarchived successfully`,
      student
    });
  } catch (error) {
    console.error("Error in unarchiveStudent:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to restore student"
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

    // 2. Mongoose query: Locate student by ObjectId or regNumber
    const studentToUpdate = await findStudentByIdOrReg(id);
    if (!studentToUpdate) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 3. Teacher Scope Validation: If authenticated as a teacher with assigned classes, verify authority over target student
    if (req.user && req.user.role === "teacher" && req.user.assignedClasses && req.user.assignedClasses.length > 0) {
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

    // 4. Map profile photo from upload (path, secure_url, or buffer stream)
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

    // 5. Handle explicit removal of profile photo
    if (req.body.removePhoto === "true" || req.body.removePhoto === true) {
      updateData.profilePhoto = null;
    }

    // 6. Mongoose query: Update student document using its resolved MongoDB _id
    const updated = await Student.findByIdAndUpdate(studentToUpdate._id, updateData, { new: true, runValidators: true });

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

    // 1. Mongoose query: Locate student by ObjectId or regNumber
    const studentToDelete = await findStudentByIdOrReg(id);
    if (!studentToDelete) {
      return res.status(404).json({
        success: false,
        message: "Student not found"
      });
    }

    // 2. Mongoose query: Find student by MongoDB ObjectId and remove document
    await Student.findByIdAndDelete(studentToDelete._id);

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
