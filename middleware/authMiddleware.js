import jwt from "jsonwebtoken";
import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";

// Helper: Extract JWT token from Authorization header or HTTP-only cookie
export const extractToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    return req.headers.authorization.split(" ")[1];
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
};

// ==========================================
// 1. ADMIN AUTHENTICATION
// ==========================================

// Protect routes - for Admin only
export const protect = async (req, res, next) => {
  // Check session first (for admin panel view routes)
  if (req.session && req.session.admin) {
    req.admin = await Admin.findById(req.session.admin._id).select("-password");
    if (req.admin) {
      req.user = req.admin;
      return next();
    }
  }

  // Check Bearer token or cookie token
  const token = extractToken(req);
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

      if (!admin) {
        return res.status(401).json({ success: false, message: "Not authorized, admin not found" });
      }

      req.admin = admin;
      req.user = admin;
      return next();
    } catch (error) {
      console.error("Admin token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Token expired, please login again" });
      }
      return res.status(401).json({ success: false, message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ success: false, message: "Not authorized, no token provided" });
};

// Admin only middleware (role guard)
export const adminOnly = (req, res, next) => {
  if (req.admin || (req.user && req.user.role === "admin")) {
    return next();
  }
  return res.status(403).json({ success: false, message: "Access denied. Admin only." });
};

// Admin authentication for user routes (supports both session and token)
export const protectAdmin = async (req, res, next) => {
  // Check session first
  if (req.session && req.session.admin) {
    req.admin = await Admin.findById(req.session.admin._id).select("-password");
    if (req.admin) {
      req.user = req.admin;
      return next();
    }
  }

  // Check Bearer token or cookie token
  const token = extractToken(req);
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

      if (!admin) {
        return res.status(403).json({ 
          success: false, 
          message: "Access denied. Admin privileges required." 
        });
      }

      req.admin = admin;
      req.user = admin;
      return next();
    } catch (error) {
      console.error("Admin token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Token expired, please login again" });
      }
      return res.status(401).json({ success: false, message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ 
    success: false, 
    message: "Not authorized, no token provided" 
  });
};

// ==========================================
// 2. TEACHER AUTHENTICATION
// ==========================================

// Protect routes - for Teachers only
export const protectTeacher = async (req, res, next) => {
  // Check session first
  if (req.session) {
    const sessionUser = req.session.teacher || (req.session.user && req.session.user.role === "teacher" ? req.session.user : null);
    if (sessionUser) {
      const teacher = await User.findById(sessionUser._id).select("-password");
      if (teacher && teacher.isActive && teacher.role === "teacher") {
        req.teacher = teacher;
        req.user = teacher;
        req.userType = "teacher";
        return next();
      }
    }
  }

  // Check Bearer token or cookie token
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return res.status(401).json({ success: false, message: "Not authorized, user not found" });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: "Account is deactivated. Please contact admin." });
      }
      if (user.role !== "teacher") {
        return res.status(403).json({ success: false, message: "Access denied. Teacher privileges required." });
      }

      req.teacher = user;
      req.user = user;
      req.userType = "teacher";
      return next();
    } catch (error) {
      console.error("Teacher token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Token expired, please login again" });
      }
      return res.status(401).json({ success: false, message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ success: false, message: "Not authorized, no token provided" });
};

// ==========================================
// 3. USER AUTHENTICATION (Students/Parents/Teachers)
// ==========================================

export const protectUser = async (req, res, next) => {
  // Check session first
  if (req.session && req.session.user) {
    req.user = await User.findById(req.session.user._id).select("-password");
    if (req.user && req.user.isActive) {
      return next();
    }
    if (req.user && !req.user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: "Account is deactivated. Please contact admin." 
      });
    }
  }

  // Check Bearer token or cookie token
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(401).json({ success: false, message: "Not authorized, user not found" });
      }

      if (!req.user.isActive) {
        return res.status(403).json({ 
          success: false,
          message: "Account is deactivated. Please contact admin." 
        });
      }

      return next();
    } catch (error) {
      console.error("User token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Token expired, please login again" });
      }
      return res.status(401).json({ success: false, message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ success: false, message: "Not authorized, no token provided" });
};

// ==========================================
// 4. COMBINED AUTHENTICATION
// ==========================================

// Allows both Admins and Users
export const protectAdminOrUser = async (req, res, next) => {
  // Check session first
  if (req.session) {
    if (req.session.admin) {
      req.admin = await Admin.findById(req.session.admin._id).select("-password");
      if (req.admin) {
        req.user = req.admin;
        req.userType = "admin";
        return next();
      }
    }
    if (req.session.user) {
      req.user = await User.findById(req.session.user._id).select("-password");
      if (req.user && req.user.isActive) {
        req.userType = req.user.role || "user";
        return next();
      }
    }
  }

  // Check Bearer token or cookie token
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Try Admin first
      const admin = await Admin.findById(decoded.id).select("-password");
      if (admin) {
        req.admin = admin;
        req.user = admin;
        req.userType = "admin";
        return next();
      }

      // Try User
      const user = await User.findById(decoded.id).select("-password");
      if (user) {
        if (!user.isActive) {
          return res.status(403).json({ 
            success: false,
            message: "Account is deactivated. Please contact admin." 
          });
        }
        req.user = user;
        req.userType = user.role || "user";
        return next();
      }

      return res.status(401).json({ success: false, message: "Not authorized, account not found" });
    } catch (error) {
      console.error("Token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, message: "Token expired, please login again" });
      }
      return res.status(401).json({ success: false, message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ success: false, message: "Not authorized, no token provided" });
};

// Allows both Admins and Teachers (blocks Students & Parents)
export const protectAdminOrTeacher = async (req, res, next) => {
  // Check session first (for view routes)
  if (req.session) {
    if (req.session.admin) {
      req.admin = await Admin.findById(req.session.admin._id).select("-password");
      if (req.admin) {
        req.user = req.admin;
        req.userType = "admin";
        return next();
      }
    }
    const sessionTeacher = req.session.teacher || (req.session.user && req.session.user.role === "teacher" ? req.session.user : null);
    if (sessionTeacher) {
      req.user = await User.findById(sessionTeacher._id).select("-password");
      if (req.user && req.user.isActive && req.user.role === "teacher") {
        req.teacher = req.user;
        req.userType = "teacher";
        return next();
      }
    }
  }

  // Check Bearer token or cookie token
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if Admin
      const admin = await Admin.findById(decoded.id).select("-password");
      if (admin) {
        req.admin = admin;
        req.user = admin;
        req.userType = "admin";
        return next();
      }

      // Check if User (must have role === "teacher")
      const user = await User.findById(decoded.id).select("-password");
      if (user) {
        if (!user.isActive) {
          return res.status(403).json({
            success: false,
            message: "Account is deactivated. Please contact admin."
          });
        }
        if (user.role === "teacher") {
          req.user = user;
          req.teacher = user;
          req.userType = "teacher";
          return next();
        }
        return res.status(403).json({
          success: false,
          message: "Access denied. Only teachers and admins are authorized."
        });
      }

      return res.status(401).json({
        success: false,
        message: "Not authorized, account not found"
      });
    } catch (error) {
      console.error("Token verification failed:", error.message);
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired, please login again"
        });
      }
      return res.status(401).json({
        success: false,
        message: "Not authorized, token failed"
      });
    }
  }

  return res.status(401).json({
    success: false,
    message: "Not authorized, no token provided"
  });
};

// ==========================================
// 5. ROLE-BASED ACCESS CONTROL
// ==========================================

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false,
        message: `Access denied. This action requires one of these roles: ${roles.join(", ")}` 
      });
    }

    return next();
  };
};

export const publicOrProtect = async (req, res, next) => {
  const token = extractToken(req);
  if (!token && !req.session?.user && !req.session?.admin) {
    return next();
  }
  return protectAdminOrUser(req, res, next);
};
