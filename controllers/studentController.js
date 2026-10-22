import Student from "../models/studentModel.js";
import { uploadToCloudinary } from "../config/cloudinary.js";

// @desc Add new student
// @route POST /admin/students/add
export const addStudent = async (req, res) => {
  try {
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

    if (!name || !classLevel || !session || !regNumber || !gender) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    const existing = await Student.findOne({ regNumber });
    if (existing) {
      return res.status(400).json({ message: "Reg Number already exists" });
    }

    // ⭐ If a profile picture is uploaded
    let profilePhotoUrl = null;
    if (req.file) {
      if (req.file.buffer) {
        const uploadRes = await uploadToCloudinary(req.file.buffer, "students");
        profilePhotoUrl = uploadRes.secure_url;
      } else if (req.file.path) {
        profilePhotoUrl = req.file.path;
      }
    }

    const student = await Student.create({
      name,
      classLevel,
      session,
      regNumber,
      gender,
      dateOfBirth,
      address,
      parentName,
      parentPhone,
      parentEmail,
      profilePhoto: profilePhotoUrl,
    });

    res.status(201).json(student);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};


// @desc Get all students
// @route GET /admin/students
export const getStudents = async (req, res) => {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.status(200).json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc Update student
// @route POST /admin/students/edit/:id
export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    let updateData = { ...req.body };

    // ⭐ If new profile photo uploaded, replace old one
    if (req.file) {
      if (req.file.buffer) {
        const uploadRes = await uploadToCloudinary(req.file.buffer, "students");
        updateData.profilePhoto = uploadRes.secure_url;
      } else if (req.file.path) {
        updateData.profilePhoto = req.file.path;
      }
    }

    if (req.body.removePhoto === "true") {
      updateData.profilePhoto = null;
    }

    const updated = await Student.findByIdAndUpdate(id, updateData, { new: true });

    if (!updated) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json(updated);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc Delete student
// @route DELETE /admin/students/delete/:id
export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Student.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({ message: "Student removed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
