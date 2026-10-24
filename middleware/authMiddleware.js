import jwt from "jsonwebtoken";
import Admin from "../models/adminModel.js";
import User from "../models/userModel.js";

// ==========================================
// ADMIN AUTHENTICATION (supports both Session and Bearer token)
// ==========================================

// Protect routes - for Admin only
export const protect = async (req, res, next) => {
  // Check session first (for admin panel routes)
  if (req.session && req.session.admin) {
    req.admin = await Admin.findById(req.session.admin._id).select("-password");
    if (req.admin) {
      return next();
    }
  }

  // Check Bearer token (for API routes)
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.admin = await Admin.findById(decoded.id).select("-password");

      if (!req.admin) {
        return res.status(401).json({ message: "Not authorized, admin not found" });
      }

      return next();
    } catch (error) {
      console.error("Token verification failed:", error);
      
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired, please login again" });
      }
      
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided" });
};

// Admin only middleware
export const adminOnly = (req, res, next) => {
  if (req.admin) {
    return next();
  } else {
    return res.status(403).json({ message: "Access denied. Admin only." });
  }
};

// ==========================================
// USER AUTHENTICATION (Students/Parents/Teachers)
// ==========================================

// Protect routes - for Users (students/parents/teachers)
export const protectUser = async (req, res, next) => {
  // Check session first
  if (req.session && req.session.user) {
    req.user = await User.findById(req.session.user._id).select("-password");
    if (req.user && req.user.isActive) {
      return next();
    }
    if (req.user && !req.user.isActive) {
      return res.status(403).json({ 
        message: "Account is deactivated. Please contact admin." 
      });
    }
  }

  // Check Bearer token
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = await User.findById(decoded.id).select("-password");

      if (!req.user) {
        return res.status(401).json({ message: "Not authorized, user not found" });
      }

      // Check if user account is active
      if (!req.user.isActive) {
        return res.status(403).json({ 
          message: "Account is deactivated. Please contact admin." 
        });
      }

      return next();
    } catch (error) {
      console.error("Token verification failed:", error);
      
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired, please login again" });
      }
      
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided" });
};

// ==========================================
// COMBINED AUTHENTICATION
// ==========================================

// Protect routes - accepts both Admin and User tokens
export const protectAdminOrUser = async (req, res, next) => {
  // Check session first
  if (req.session) {
    if (req.session.admin) {
      req.admin = await Admin.findById(req.session.admin._id).select("-password");
      if (req.admin) {
        req.userType = "admin";
        return next();
      }
    }
    if (req.session.user) {
      req.user = await User.findById(req.session.user._id).select("-password");
      if (req.user && req.user.isActive) {
        req.userType = "user";
        return next();
      }
    }
  }

  // Check Bearer token
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Try to find as Admin first
      const admin = await Admin.findById(decoded.id).select("-password");
      if (admin) {
        req.admin = admin;
        req.userType = "admin";
        return next();
      }

      // If not admin, try as User
      const user = await User.findById(decoded.id).select("-password");
      if (user) {
        if (!user.isActive) {
          return res.status(403).json({ 
            message: "Account is deactivated. Please contact admin." 
          });
        }
        req.user = user;
        req.userType = "user";
        return next();
      }

      return res.status(401).json({ message: "Not authorized, account not found" });
    } catch (error) {
      console.error("Token verification failed:", error);
      
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired, please login again" });
      }
      
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  return res.status(401).json({ message: "Not authorized, no token provided" });
};

// ==========================================
// ADMIN OR TEACHER AUTHENTICATION
// Allows both Admins and Teachers (blocks Students & Parents)
// ==========================================
export const protectAdminOrTeacher = async (req, res, next) => {
  // Check session first (for view/panel routes)
  if (req.session) {
    if (req.session.admin) {
      req.admin = await Admin.findById(req.session.admin._id).select("-password");
      if (req.admin) {
        req.userType = "admin";
        return next();
      }
    }
    if (req.session.user) {
      req.user = await User.findById(req.session.user._id).select("-password");
      if (req.user && req.user.isActive) {
        if (req.user.role === "teacher") {
          req.userType = "teacher";
          return next();
        }
        return res.status(403).json({
          success: false,
          message: "Access denied. Only teachers and admins are authorized."
        });
      }
    }
  }

  // Check Bearer token (for API routes)
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if Admin
      const admin = await Admin.findById(decoded.id).select("-password");
      if (admin) {
        req.admin = admin;
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
      console.error("Token verification failed:", error);
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

// Admin authentication for user routes (supports both session and token)
export const protectAdmin = async (req, res, next) => {
  // Check session first (THIS IS THE KEY FIX!)
  if (req.session && req.session.admin) {
    console.log('✅ Admin found in session:', req.session.admin.email);
    req.admin = await Admin.findById(req.session.admin._id).select("-password");
    if (req.admin) {
      return next();
    }
  }

  // Check Bearer token
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.admin = await Admin.findById(decoded.id).select("-password");

      if (!req.admin) {
        return res.status(403).json({ 
          success: false,
          message: "Access denied. Admin privileges required." 
        });
      }

      return next();
    } catch (error) {
      console.error("Token verification failed:", error);
      return res.status(401).json({ 
        success: false,
        message: "Not authorized, token failed" 
      });
    }
  }

  console.log('❌ No admin session or token found');
  return res.status(401).json({ 
    success: false,
    message: "Not authorized, no token provided" 
  });
};

// ==========================================
// ROLE-BASED ACCESS CONTROL
// ==========================================

// Check if user has specific role
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Access denied. This action requires one of these roles: ${roles.join(", ")}` 
      });
    }

    return next();
  };
};

// Public access for report cards (optional - allows viewing without auth)
export const publicOrProtect = async (req, res, next) => {
  // Allow public access if no token provided
  if (!req.headers.authorization) {
    return next();
  }

  // If token is provided, verify it
  return protectAdminOrUser(req, res, next);
};
