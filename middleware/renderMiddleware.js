import jwt from "jsonwebtoken";
import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";

// Middleware to check if admin is logged in (for EJS pages)
export const requireAdminAuth = async (req, res, next) => {
  try {
    // Check session first
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }

    // Verify token if exists
    const token = req.session.adminToken;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const admin = await Admin.findById(decoded.id).select("-password");

      if (!admin) {
        req.session.destroy();
        return res.redirect('/admin/login');
      }

      req.admin = admin;
      res.locals.admin = admin;
    }

    next();
  } catch (error) {
    req.session.destroy();
    res.redirect('/admin/login');
  }
};

// Middleware to check if user is logged in (for EJS pages)
export const requireUserAuth = async (req, res, next) => {
  try {
    if (!req.session.user) {
      return res.redirect('/user/login');
    }

    const token = req.session.userToken;
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user || !user.isActive) {
        req.session.destroy();
        return res.redirect('/user/login');
      }

      req.user = user;
      res.locals.user = user;
    }

    next();
  } catch (error) {
    req.session.destroy();
    res.redirect('/user/login');
  }
};

// Middleware to check if teacher is logged in (for Teacher EJS pages & API)
export const requireTeacherAuth = async (req, res, next) => {
  try {
    // 1. Check Bearer token (for API / Postman testing)
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
          return res.status(401).json({ success: false, message: "User not found" });
        }
        if (!user.isActive) {
          return res.status(403).json({ success: false, message: "Account is deactivated" });
        }
        if (user.role !== "teacher") {
          return res.status(403).json({
            success: false,
            message: "Access denied. Only teachers are authorized.",
          });
        }

        req.teacher = user;
        req.user = user;
        res.locals.teacher = user;
        return next();
      } catch (err) {
        return res.status(401).json({ success: false, message: "Not authorized, token failed" });
      }
    }

    // 2. Check session (for browser navigation)
    const sessionUser = req.session?.teacher || req.session?.user;
    if (sessionUser) {
      const teacherId = sessionUser._id;
      const teacher = await User.findById(teacherId).select("-password");

      if (!teacher || !teacher.isActive || teacher.role !== "teacher") {
        delete req.session.teacher;
        if (req.session.user?.role === "teacher") {
          delete req.session.user;
        }

        if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
          return res.status(403).json({
            success: false,
            message: "Access denied. Only teachers are authorized.",
          });
        }
        return res.redirect("/teacher/login");
      }

      req.teacher = teacher;
      req.user = teacher;
      res.locals.teacher = teacher;
      return next();
    }

    // 3. Unauthenticated request
    if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, please login as teacher",
      });
    }
    return res.redirect("/teacher/login");
  } catch (error) {
    console.error("Teacher auth error:", error);
    if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
      return res.status(500).json({ success: false, message: "Internal authentication error" });
    }
    res.redirect("/teacher/login");
  }
};

// Redirect if already logged in
export const redirectIfLoggedIn = (req, res, next) => {
  if (req.session.admin) {
    return res.redirect('/admin/dashboard');
  }
  if (req.session.teacher || (req.session.user && req.session.user.role === 'teacher')) {
    return res.redirect('/teacher/dashboard');
  }
  if (req.session.user) {
    return res.redirect('/user/dashboard');
  }
  next();
};