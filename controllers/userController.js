import User from "../models/userModel.js";
import Student from "../models/studentModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// @desc    Login user
// @route   POST /api/users/login
// @access  Public

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      if (req.accepts("html") && !req.is("json")) {
        return res.render("user/login", { error: "Invalid email or password", title: "User Login" });
      }
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isActive) {
      if (req.accepts("html") && !req.is("json")) {
        return res.render("user/login", { error: "Account is deactivated", title: "User Login" });
      }
      return res.status(403).json({ message: "Account is deactivated" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      if (req.accepts("html") && !req.is("json")) {
        return res.render("user/login", { error: "Invalid email or password", title: "User Login" });
      }
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await user.updateLastLogin();

    if (req.session) {
      req.session.user = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
      req.session.userToken = token;
    }

    if (req.accepts("html") && !req.is("json")) {
      return res.redirect("/user/dashboard");
    }

    return res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    if (req.accepts("html") && !req.is("json")) {
      return res.render("user/login", { error: "Something went wrong", title: "User Login" });
    }
    return res.status(500).json({ message: err.message });
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
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phoneNumber: user.phoneNumber,
      student: user.student,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
