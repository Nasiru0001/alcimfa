import mongoose from "mongoose";
import User from "../models/userModel.js";
import Student from "../models/studentModel.js";
import Admin from "../models/adminModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// @desc    Login user (supports JSON API & HTML form cookie auth)
// @route   POST /api/users/login, POST /login, POST /user/login
// @access  Public

export const loginUser = async (req, res) => {
  const isJson = req.is("json") || (req.headers.accept && req.headers.accept.includes("application/json") && !req.headers.accept.includes("text/html"));
  const isHtml = !isJson && (
    (req.accepts && req.accepts("html")) ||
    (req.headers["content-type"] && req.headers["content-type"].includes("application/x-www-form-urlencoded"))
  );

  const identifier = (req.body.email || req.body.username || "").trim();
  const password = req.body.password;

  if (!identifier || !password) {
    if (isHtml) {
      return res.render("user/login", { error: "Please enter both email/username and password", title: "User Login" });
    }
    return res.status(400).json({ success: false, message: "Please enter both email/username and password" });
  }

  try {
    // 1. Check User collection first
    let account = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { name: new RegExp(`^${identifier}$`, "i") }
      ]
    }).select("+password");

    let role = account ? account.role : null;
    let isAdmin = false;

    // 2. If not found in User, check Admin collection
    if (!account) {
      const admin = await Admin.findOne({ email: identifier.toLowerCase() });
      if (admin) {
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
          if (isHtml) {
            return res.render("user/login", { error: "Invalid email or password", title: "User Login" });
          }
          return res.status(401).json({ success: false, message: "Invalid email or password" });
        }
        account = admin;
        role = "admin";
        isAdmin = true;
      }
    }

    if (!account) {
      if (isHtml) {
        return res.render("user/login", { error: "Invalid email or password", title: "User Login" });
      }
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    // 3. If User account, verify active status and password
    if (!isAdmin) {
      if (!account.isActive) {
        if (isHtml) {
          return res.render("user/login", { error: "Account is deactivated", title: "User Login" });
        }
        return res.status(403).json({ success: false, message: "Account is deactivated" });
      }

      const isMatch = await account.comparePassword(password);
      if (!isMatch) {
        if (isHtml) {
          return res.render("user/login", { error: "Invalid email or password", title: "User Login" });
        }
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      { id: account._id, role: role || (isAdmin ? "admin" : "student") },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // 5. Set HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    });

    // 6. Update last login
    if (account.updateLastLogin) {
      await account.updateLastLogin();
    }

    // 7. Store in session for view templates backwards compatibility
    if (req.session) {
      if (role === "admin") {
        req.session.admin = {
          _id: account._id,
          name: account.name,
          email: account.email,
          role: "admin",
        };
        req.session.adminToken = token;
      } else {
        req.session.user = {
          _id: account._id,
          name: account.name,
          email: account.email,
          role: account.role,
          assignedSubjects: account.assignedSubjects || [],
          assignedClasses: account.assignedClasses || [],
        };
        if (account.role === "teacher") {
          req.session.teacher = req.session.user;
          req.session.teacherToken = token;
        }
        req.session.userToken = token;
      }
    }

    // 8. Role-based redirect for HTML/browser requests
    if (isHtml) {
      if (role === "admin") {
        return res.redirect("/admin/dashboard");
      }
      if (role === "teacher") {
        return res.redirect("/teacher/dashboard");
      }
      return res.redirect("/user/dashboard");
    }

    // 9. Standard JSON response for API / Postman consumers
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: account._id,
        name: account.name,
        email: account.email,
        role: role || account.role,
        assignedSubjects: account.assignedSubjects || [],
        assignedClasses: account.assignedClasses || [],
      },
    });
  } catch (err) {
    console.error("Login controller error:", err);
    if (isHtml) {
      return res.render("user/login", { error: "Something went wrong during login", title: "User Login" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};


// @desc    Get user profile
// @route   GET /api/users/profile
// @access  Private (User only)
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("-password")
      .populate("student", "name regNumber classLevel session");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phoneNumber: user.phoneNumber,
      student: user.student,
      isActive: user.isActive,
      assignedSubjects: user.assignedSubjects || [],
      assignedClasses: user.assignedClasses || [],
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private (User only)
export const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update allowed fields
    user.name = req.body.name || user.name;
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;

    // Check if email is being changed and if it's already taken
    if (req.body.email && req.body.email !== user.email) {
      const emailExists = await User.findOne({ email: req.body.email });
      if (emailExists) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = req.body.email;
    }

    // Update password if provided
    if (req.body.password) {
      if (req.body.password.length < 6) {
        return res.status(400).json({
          message: "Password must be at least 6 characters"
        });
      }
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phoneNumber: updatedUser.phoneNumber,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Change user password
// @route   PUT /api/users/change-password
// @access  Private (User only)
export const changeUserPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters"
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    const { role, isActive } = req.query;

    // Build filter
    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const users = await User.find(filter)
      .select("-password")
      .populate("student", "name regNumber classLevel")
      .sort({ createdAt: -1 });

    res.json({
      count: users.length,
      users,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user by ID (Admin only)
// @route   GET /api/users/:id
// @access  Private (Admin only)
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("student", "name regNumber classLevel session");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user (Admin only)
// @route   PUT /api/users/:id
// @access  Private (Admin only)
export const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.role = req.body.role || user.role;
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
    user.isActive = req.body.isActive !== undefined ? req.body.isActive : user.isActive;

    if (req.body.student) {
      user.student = req.body.student;
    }

    const updatedUser = await user.save();

    res.json({
      message: "User updated successfully",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete user (Admin only)
// @route   DELETE /api/users/:id OR POST /api/users/:id/delete
// @access  Private (Admin only)
export const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    console.log(`🗑️ Deleting user: ${user.name} (${user.email})`);

    await user.deleteOne();

    console.log(`✅ User deleted successfully`);

    // Check if request came from POST /delete (like deactivate/activate)
    // These redirect, while DELETE returns JSON
    if (req.method === 'POST' && req.path.endsWith('/delete')) {
      return res.redirect("/admin/users?success=User deleted successfully");
    }

    // Otherwise return JSON (for DELETE method or AJAX)
    res.json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("❌ Delete user error:", error);

    // If POST request, redirect with error
    if (req.method === 'POST' && req.path.endsWith('/delete')) {
      return res.redirect("/admin/users?error=" + error.message);
    }

    // Otherwise return JSON error
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Deactivate user account (Admin only)
// @route   PATCH /api/users/:id/deactivate
// @access  Private (Admin only)
export const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = false;
    await user.save();

    return res.redirect("/admin/users");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Activate user account (Admin only)
// @route   PATCH /api/users/:id/activate
// @access  Private (Admin only)
export const activateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = true;
    await user.save();

    return res.redirect("/admin/users");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Assign subjects and class levels to a teacher
// @route   PATCH /api/admin/teachers/:id/assign-subjects, PUT /api/admin/teachers/:id/assign-subjects
// @access  Private (Admin only)
export const assignTeacherSubjects = async (req, res) => {
  try {
    const { id } = req.params;
    let { assignedSubjects, subjectName, classLevel } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid teacher ID format",
      });
    }

    const teacher = await User.findById(id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: "Teacher not found",
      });
    }

    if (teacher.role !== "teacher") {
      return res.status(400).json({
        success: false,
        message: "Target user is not a teacher",
      });
    }

    // Support single subject assignment via subjectName & classLevel
    if (!assignedSubjects && subjectName && classLevel) {
      const trimmedSubj = subjectName.trim();
      const trimmedClass = classLevel.trim();

      const current = teacher.assignedSubjects || [];
      const alreadyExists = current.some(
        (s) => s.subjectName.toLowerCase() === trimmedSubj.toLowerCase() &&
               s.classLevel.toLowerCase() === trimmedClass.toLowerCase()
      );

      if (alreadyExists) {
        return res.status(400).json({
          success: false,
          message: `Subject "${trimmedSubj}" for class "${trimmedClass}" is already assigned to ${teacher.name}.`,
        });
      }

      assignedSubjects = [...current, { subjectName: trimmedSubj, classLevel: trimmedClass }];
    }

    if (!assignedSubjects || !Array.isArray(assignedSubjects)) {
      return res.status(400).json({
        success: false,
        message: "assignedSubjects must be an array of { subjectName, classLevel } objects or provide subjectName and classLevel",
      });
    }

    for (const item of assignedSubjects) {
      if (!item || typeof item !== "object" || !item.subjectName || !item.classLevel) {
        return res.status(400).json({
          success: false,
          message: "Each assigned subject must have both 'subjectName' and 'classLevel'",
        });
      }
    }

    const formatted = assignedSubjects.map((s) => ({
      subjectName: s.subjectName.trim(),
      classLevel: s.classLevel.trim(),
    }));

    teacher.assignedSubjects = formatted;

    // Automatically sync assignedClasses with unique class levels
    const uniqueClasses = [...new Set(formatted.map((s) => s.classLevel))];
    teacher.assignedClasses = uniqueClasses;

    await teacher.save();

    return res.status(200).json({
      success: true,
      message: "Teacher subjects assigned successfully",
      data: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        assignedSubjects: teacher.assignedSubjects,
        assignedClasses: teacher.assignedClasses,
      },
    });
  } catch (error) {
    console.error("Error in assignTeacherSubjects:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to assign subjects to teacher",
    });
  }
};

// @desc    Unassign a subject from a teacher
// @route   DELETE /api/admin/teachers/:id/assign-subjects
// @access  Private (Admin only)
export const unassignTeacherSubject = async (req, res) => {
  try {
    const { id } = req.params;
    const { subjectName, classLevel } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid teacher ID format" });
    }

    const teacher = await User.findById(id);
    if (!teacher || teacher.role !== "teacher") {
      return res.status(404).json({ success: false, message: "Teacher not found" });
    }

    if (!subjectName || !classLevel) {
      return res.status(400).json({ success: false, message: "Both subjectName and classLevel are required to unassign" });
    }

    const trimmedSubj = subjectName.trim().toLowerCase();
    const trimmedClass = classLevel.trim().toLowerCase();

    teacher.assignedSubjects = (teacher.assignedSubjects || []).filter(
      (s) => !(s.subjectName.toLowerCase() === trimmedSubj && s.classLevel.toLowerCase() === trimmedClass)
    );

    teacher.assignedClasses = [...new Set((teacher.assignedSubjects || []).map((s) => s.classLevel))];

    await teacher.save();

    return res.status(200).json({
      success: true,
      message: "Subject unassigned successfully",
      data: {
        _id: teacher._id,
        name: teacher.name,
        email: teacher.email,
        assignedSubjects: teacher.assignedSubjects,
        assignedClasses: teacher.assignedClasses,
      },
    });
  } catch (error) {
    console.error("Error in unassignTeacherSubject:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

