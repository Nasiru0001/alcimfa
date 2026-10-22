import express from "express";
import { requireUserAuth, redirectIfLoggedIn } from "../middleware/renderMiddleware.js";
import User from "../models/userModel.js";
import Student from "../models/studentModel.js";
import Result from "../models/resultModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

// Login page
router.get("/login", redirectIfLoggedIn, (req, res) => {
  res.render("user/login", { 
    error: req.query.error || null,
    success: req.query.success || null,
    title: "User Login"
  });
});

// Register page
router.get("/register", redirectIfLoggedIn, (req, res) => {
  res.render("user/register", {
    error: req.query.error || null,
    success: req.query.success || null,
    title: "Student & Parent Registration"
  });
});

// Process registration
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role, regNumber, phoneNumber } = req.body;

    if (!name || !email || !password || !role || !regNumber) {
      return res.render("user/register", {
        error: "All required fields must be provided",
        title: "Student & Parent Registration"
      });
    }

    if (password !== confirmPassword) {
      return res.render("user/register", {
        error: "Passwords do not match",
        title: "Student & Parent Registration"
      });
    }

    if (password.length < 6) {
      return res.render("user/register", {
        error: "Password must be at least 6 characters long",
        title: "Student & Parent Registration"
      });
    }

    // Check if email already registered
    const existingUser = await User.findOne({ email: email.trim().toLowerCase() });
    if (existingUser) {
      return res.render("user/register", {
        error: "An account with this email already exists",
        title: "Student & Parent Registration"
      });
    }

    // Validate student registration number exists
    const student = await Student.findOne({ regNumber: regNumber.trim() });
    if (!student) {
      return res.render("user/register", {
        error: `No student record found with Registration Number "${regNumber}". Please verify with school administration.`,
        title: "Student & Parent Registration"
      });
    }

    // Create user
    await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role: role === "parent" ? "parent" : "student",
      student: student._id,
      phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
    });

    res.redirect("/user/login?success=" + encodeURIComponent("Account created successfully! Please login."));
  } catch (error) {
    console.error("User registration error:", error);
    res.render("user/register", {
      error: error.message || "Registration failed",
      title: "Student & Parent Registration"
    });
  }
});

// Process login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.render("user/login", { 
        error: "Invalid email or password",
        title: "User Login"
      });
    }
    
    if (!user.isActive) {
      return res.render("user/login", { 
        error: "Account is deactivated",
        title: "User Login"
      });
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render("user/login", { 
        error: "Invalid email or password",
        title: "User Login"
      });
    }
    
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });
    
    req.session.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    req.session.userToken = token;
    
    await user.updateLastLogin();
    
    res.redirect("/user/dashboard");
  } catch (error) {
    res.render("user/login", { 
      error: "Login failed",
      title: "User Login"
    });
  }
});



// Dashboard
router.get("/dashboard", requireUserAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("student");
    
    let result = null;
    if (user.student) {
      result = await Result.findOne({ student: user.student._id }).sort({ createdAt: -1 });
    }
    
    res.render("user/dashboard", {
      title: "My Dashboard",
      user,
      result
    });
  } catch (error) {
    res.render("error", { message: error.message });
  }
});

// My Results
router.get("/results", requireUserAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("student");
    
    if (!user.student) {
      return res.render("user/my-results", {
        title: "My Results",
        user,
        results: []
      });
    }
    
    const results = await Result.find({ student: user.student._id }).sort({ createdAt: -1 });
    
    res.render("user/my-results", {
      title: "My Results",
      user,
      results
    });
  } catch (error) {
    res.render("error", { message: error.message });
  }
});


// Logout
router.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/user/login");
});

export default router;
