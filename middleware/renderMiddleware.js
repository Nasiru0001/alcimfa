import jwt from "jsonwebtoken";
import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";

// Middleware to check if admin is logged in (for Admin EJS pages)
export const requireAdminAuth = async (req, res, next) => {
  try {
    // 1. Check Cookie Token first (for browser EJS navigation)
    const token = req.cookies?.token || req.session?.adminToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        let admin = await Admin.findById(decoded.id).select("-password");
        if (!admin) {
          const userAdmin = await User.findById(decoded.id).select("-password");
          if (userAdmin && userAdmin.role === "admin") {
            admin = userAdmin;
          }
        }

        if (admin) {
          req.admin = admin;
          req.user = admin;
          res.locals.admin = admin;
          if (req.session) {
            req.session.admin = {
              _id: admin._id,
              name: admin.name,
              email: admin.email,
              role: "admin",
            };
            req.session.adminToken = token;
          }
          return next();
        } else {
          res.clearCookie("token");
        }
      } catch (err) {
        res.clearCookie("token");
      }
    }

    // 2. Check Session fallback
    if (req.session?.admin) {
      const admin = await Admin.findById(req.session.admin._id).select("-password");
      if (admin) {
        req.admin = admin;
        req.user = admin;
        res.locals.admin = admin;
        return next();
      }
    }

    // 3. Unauthenticated request
    if (req.session) req.session.destroy(() => {});
    res.clearCookie("token");
    return res.redirect("/admin/login");
  } catch (error) {
    if (req.session) req.session.destroy(() => {});
    res.clearCookie("token");
    return res.redirect("/admin/login");
  }
};

// Middleware to check if user is logged in (for Student / Parent EJS pages)
export const requireUserAuth = async (req, res, next) => {
  try {
    // 1. Check Bearer token (for API)
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        if (user && user.isActive) {
          req.user = user;
          res.locals.user = user;
          return next();
        }
      } catch (err) {}
    }

    // 2. Check Cookie Token (for browser EJS navigation)
    const token = req.cookies?.token || req.session?.userToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (user && user.isActive) {
          req.user = user;
          res.locals.user = user;
          if (req.session) {
            req.session.user = {
              _id: user._id,
              name: user.name,
              email: user.email,
              role: user.role,
              assignedSubjects: user.assignedSubjects || [],
              assignedClasses: user.assignedClasses || [],
            };
            req.session.userToken = token;
          }
          return next();
        } else {
          res.clearCookie("token");
        }
      } catch (err) {
        res.clearCookie("token");
      }
    }

    // 3. Check Session fallback
    if (req.session?.user) {
      const user = await User.findById(req.session.user._id).select("-password");
      if (user && user.isActive) {
        req.user = user;
        res.locals.user = user;
        return next();
      }
    }

    if (req.session) req.session.destroy(() => {});
    res.clearCookie("token");
    return res.redirect("/login");
  } catch (error) {
    if (req.session) req.session.destroy(() => {});
    res.clearCookie("token");
    return res.redirect("/login");
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

    // 2. Check Cookie Token (for browser EJS navigation)
    const token = req.cookies?.token || req.session?.teacherToken;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (user && user.isActive && user.role === "teacher") {
          req.teacher = user;
          req.user = user;
          res.locals.teacher = user;
          if (req.session) {
            req.session.teacher = {
              _id: user._id,
              name: user.name,
              email: user.email,
              role: "teacher",
              assignedClasses: user.assignedClasses || [],
              assignedSubjects: user.assignedSubjects || [],
            };
            req.session.user = req.session.teacher;
            req.session.teacherToken = token;
          }
          return next();
        } else {
          // Token is for a non-teacher or deactivated account
          res.clearCookie("token");
          if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
            return res.status(403).json({
              success: false,
              message: "Access denied. Only teachers are authorized.",
            });
          }
          return res.redirect("/admin/login");
        }
      } catch (err) {
        res.clearCookie("token");
      }
    }

    // 3. Check Session fallback
    const sessionUser = req.session?.teacher || (req.session?.user?.role === "teacher" ? req.session.user : null);
    if (sessionUser) {
      const teacher = await User.findById(sessionUser._id).select("-password");
      if (teacher && teacher.isActive && teacher.role === "teacher") {
        req.teacher = teacher;
        req.user = teacher;
        res.locals.teacher = teacher;
        return next();
      }
    }

    // 4. Unauthenticated request
    if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, please login as teacher",
      });
    }
    return res.redirect("/admin/login");
  } catch (error) {
    console.error("Teacher auth error:", error);
    if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
      return res.status(500).json({ success: false, message: "Internal authentication error" });
    }
    res.redirect("/admin/login");
  }
};

// Redirect if already logged in (inspects cookie token first, then session)
export const redirectIfLoggedIn = (req, res, next) => {
  const token = req.cookies?.token;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role === "admin") {
        return res.redirect("/admin/dashboard");
      }
      if (decoded.role === "teacher") {
        return res.redirect("/teacher/dashboard");
      }
      return res.redirect("/user/dashboard");
    } catch (err) {
      res.clearCookie("token");
    }
  }

  if (req.session?.admin) {
    return res.redirect("/admin/dashboard");
  }
  if (req.session?.teacher || (req.session?.user && req.session.user.role === "teacher")) {
    return res.redirect("/teacher/dashboard");
  }
  if (req.session?.user) {
    return res.redirect("/user/dashboard");
  }

  next();
};