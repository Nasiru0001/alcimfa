import express from "express";
import User from "../models/userModel.js";
import Student from "../models/studentModel.js";
import Result from "../models/resultModel.js";
import { requireTeacherAuth, redirectIfLoggedIn } from "../middleware/renderMiddleware.js";
import { findStudentByIdOrReg } from "../controllers/studentController.js";
import bcrypt from "bcryptjs";

const router = express.Router();

// Helper to compute grade & remark
const computeGradeAndRemark = (total) => {
  if (total >= 70) return { grade: "A", remark: "Excellent" };
  if (total >= 60) return { grade: "B", remark: "Very Good" };
  if (total >= 50) return { grade: "C", remark: "Good" };
  if (total >= 40) return { grade: "D", remark: "Fair" };
  return { grade: "F", remark: "Poor" };
};

// ==========================================
// 1. AUTHENTICATION & LOGIN
// ==========================================

// Teacher login page
router.get("/login", redirectIfLoggedIn, (req, res) => {
  res.render("teacher/login", {
    title: "Teacher Login",
    error: req.query.error || null,
    success: req.query.success || null,
  });
});

// Process teacher login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.render("teacher/login", {
        title: "Teacher Login",
        error: "Please enter your username/email and password",
      });
    }

    const trimmed = username.trim();
    // Allow login by email or name
    const user = await User.findOne({
      $or: [
        { email: trimmed.toLowerCase() },
        { name: new RegExp(`^${trimmed}$`, "i") }
      ]
    }).select("+password");

    if (!user) {
      return res.render("teacher/login", {
        title: "Teacher Login",
        error: "Invalid username/email or password",
      });
    }

    if (user.role !== "teacher") {
      return res.render("teacher/login", {
        title: "Teacher Login",
        error: "Access denied. Only teacher accounts can access this portal.",
      });
    }

    if (!user.isActive) {
      return res.render("teacher/login", {
        title: "Teacher Login",
        error: "Your account is deactivated. Please contact administration.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.render("teacher/login", {
        title: "Teacher Login",
        error: "Invalid username/email or password",
      });
    }

    // Save session
    req.session.teacher = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: "teacher",
      assignedClasses: user.assignedClasses || [],
      assignedSubjects: user.assignedSubjects || [],
    };
    req.session.user = req.session.teacher;

    await user.updateLastLogin();

    return res.redirect("/teacher/dashboard");
  } catch (error) {
    console.error("Teacher login error:", error);
    return res.render("teacher/login", {
      title: "Teacher Login",
      error: "An unexpected error occurred during login",
    });
  }
});

// Teacher logout
router.get("/logout", (req, res) => {
  delete req.session.teacher;
  if (req.session.user && req.session.user.role === "teacher") {
    delete req.session.user;
  }
  res.render("teacher/logout", { title: "Logging out..." });
});

// ==========================================
// 2. TEACHER DASHBOARD
// ==========================================

router.get("/", requireTeacherAuth, (req, res) => {
  res.redirect("/teacher/dashboard");
});

router.get("/dashboard", requireTeacherAuth, async (req, res) => {
  try {
    const teacher = req.teacher;
    if (!teacher || teacher.role !== "teacher") {
      if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
        return res.status(403).json({ success: false, message: "Access denied. Teacher role required." });
      }
      return res.redirect("/teacher/login");
    }

    const assignedClasses = teacher.assignedClasses || [];

    const studentQuery = { isArchived: false };
    if (assignedClasses.length > 0) {
      studentQuery.classLevel = { $in: assignedClasses };
    }

    const studentCount = await Student.countDocuments(studentQuery);

    // Total results recorded
    const totalResults = await Result.countDocuments();

    // If client requested JSON (API / Postman)
    if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
      return res.status(200).json({
        success: true,
        message: "Teacher dashboard data retrieved successfully",
        data: {
          teacher: {
            _id: teacher._id,
            name: teacher.name,
            email: teacher.email,
            role: teacher.role,
            assignedClasses: teacher.assignedClasses,
            assignedSubjects: teacher.assignedSubjects,
          },
          studentCount,
          totalResults,
        },
      });
    }

    const formattedSubjects = teacher.assignedSubjects && teacher.assignedSubjects.length > 0
      ? teacher.assignedSubjects.map(s => typeof s === "string" ? s : `${s.subjectName} (${s.classLevel})`).join(", ")
      : "All Subjects";

    res.render("teacher/dashboard", {
      title: "Teacher Dashboard",
      path: "/teacher/dashboard",
      teacherName: teacher.name,
      assignedClasses: assignedClasses.join(", ") || "All Classes",
      subject: formattedSubjects,
      studentCount,
      totalResults,
      myClasses: assignedClasses.join(", ") || "All Classes",
      teacher,
    });
  } catch (error) {
    console.error("Teacher dashboard error:", error);
    if (req.is("json") || (req.accepts("json") && !req.accepts("html"))) {
      return res.status(500).json({ success: false, message: "Failed to load dashboard: " + error.message });
    }
    res.render("error", { message: "Failed to load dashboard: " + error.message });
  }
});

// ==========================================
// 3. STUDENT MANAGEMENT VIEW
// ==========================================

router.get("/students", requireTeacherAuth, async (req, res) => {
  try {
    const teacher = req.teacher;
    const assignedClasses = teacher.assignedClasses || [];

    const query = { isArchived: false };
    if (assignedClasses.length > 0) {
      query.classLevel = { $in: assignedClasses };
    }

    const rawStudents = await Student.find(query).sort({ classLevel: 1, name: 1 });
    const students = rawStudents.map((s) => ({
      _id: s._id,
      id: s._id,
      name: s.name,
      class: s.classLevel,
      classLevel: s.classLevel,
      regNumber: s.regNumber,
      gender: s.gender,
      session: s.session,
    }));

    res.render("teacher/students", {
      title: "Students - Teacher Portal",
      path: "/teacher/students",
      students,
      subjects: teacher.assignedSubjects || [],
      assignedClasses: assignedClasses.join(", ") || "All Classes",
    });
  } catch (error) {
    console.error("Teacher students view error:", error);
    res.render("error", { message: "Failed to load students: " + error.message });
  }
});

// ==========================================
// 4. SCORE UPLOAD VIEW & MANUAL ENTRY
// ==========================================

router.get("/upload", requireTeacherAuth, async (req, res) => {
  try {
    const teacher = req.teacher;
    const assignedClasses = teacher.assignedClasses || [];

    // Fetch recent 10 results
    const recentResults = await Result.find()
      .populate("student")
      .sort({ createdAt: -1 })
      .limit(10);

    const uploadedResults = [];
    for (const r of recentResults) {
      if (r.student && r.subjects && r.subjects.length > 0) {
        for (const s of r.subjects) {
          uploadedResults.push({
            studentName: r.student.name,
            class: r.student.classLevel,
            term: r.term,
            subject: s.name,
            ca: (s.ca1 || 0) + (s.ca2 || 0),
            exam: s.exam || 0,
            total: s.total || 0,
            grade: s.grade || "N/A",
          });
        }
      }
    }

    res.render("teacher/upload", {
      title: "Upload Results - Teacher Portal",
      path: "/teacher/upload",
      assignedClassesList: assignedClasses,
      assignedSubjectsList: teacher.assignedSubjects || [],
      uploadedResults: uploadedResults.slice(0, 10),
      queryStudentId: req.query.studentId || "",
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    console.error("Teacher upload view error:", error);
    res.render("error", { message: "Failed to load upload page: " + error.message });
  }
});

// Process manual score upload
router.post("/upload/manual", requireTeacherAuth, async (req, res) => {
  try {
    const teacher = req.teacher;
    const { class: classLevel, term, session, studentIdentifier, subject, ca1, ca2, exam, teacherRemark } = req.body;

    if (!studentIdentifier || !term || !session || !subject) {
      return res.redirect(`/teacher/upload?error=${encodeURIComponent("Please fill all required score fields.")}`);
    }

    // Locate student
    const student = await findStudentByIdOrReg(studentIdentifier);
    if (!student) {
      return res.redirect(`/teacher/upload?error=${encodeURIComponent(`Student "${studentIdentifier}" not found.`)}`);
    }

    // Teacher class restriction check
    const normalizeClass = (c) => (c || "").toString().toLowerCase().replace(/[\s\-_]+/g, "");
    const normalizeSubject = (s) => (s || "").toString().toLowerCase().trim().replace(/\s+/g, " ");

    if (teacher.assignedClasses && teacher.assignedClasses.length > 0) {
      const studentClassNorm = normalizeClass(student.classLevel);
      if (!teacher.assignedClasses.map(normalizeClass).includes(studentClassNorm)) {
        return res.redirect(`/teacher/upload?error=${encodeURIComponent(`You are not authorized for class ${student.classLevel}.`)}`);
      }
    }

    // Teacher subject and class restriction check
    if (teacher.assignedSubjects && teacher.assignedSubjects.length > 0) {
      const studentClass = normalizeClass(student.classLevel);
      const targetSub = normalizeSubject(subject);

      const isAssigned = teacher.assignedSubjects.some((item) => {
        const assignedName = normalizeSubject(item.subjectName || (typeof item === "string" ? item : ""));
        const assignedClass = normalizeClass(item.classLevel);

        if (item.classLevel) {
          return assignedName === targetSub && assignedClass === studentClass;
        }
        return (
          assignedName === targetSub &&
          (!teacher.assignedClasses?.length ||
            teacher.assignedClasses.map(normalizeClass).includes(studentClass))
        );
      });

      if (!isAssigned) {
        return res.redirect(
          `/teacher/upload?error=${encodeURIComponent("Unauthorized: You are not assigned to record scores for this subject and class.")}`
        );
      }
    }

    const ca1Val = Math.min(Math.max(Number(ca1) || 0, 0), 20);
    const ca2Val = Math.min(Math.max(Number(ca2) || 0, 0), 20);
    const examVal = Math.min(Math.max(Number(exam) || 0, 0), 70);
    const subjectTotal = ca1Val + ca2Val + examVal;
    const { grade, remark } = computeGradeAndRemark(subjectTotal);

    const subjectEntry = {
      name: subject.trim(),
      ca1: ca1Val,
      ca2: ca2Val,
      exam: examVal,
      total: subjectTotal,
      grade,
      remark,
    };

    // Find or create result document for this term/session
    let result = await Result.findOne({
      student: student._id,
      term: term.trim(),
      session: session.trim(),
    });

    if (result) {
      // Update existing subject or add new subject
      const existingIdx = result.subjects.findIndex((s) => s.name.toLowerCase() === subject.trim().toLowerCase());
      if (existingIdx >= 0) {
        result.subjects[existingIdx] = subjectEntry;
      } else {
        result.subjects.push(subjectEntry);
      }
      if (teacherRemark) result.teacherRemark = teacherRemark.trim();
    } else {
      result = new Result({
        student: student._id,
        term: term.trim(),
        session: session.trim(),
        subjects: [subjectEntry],
        teacherRemark: teacherRemark ? teacherRemark.trim() : "",
      });
    }

    // Recalculate summary metrics
    const totalScore = result.subjects.reduce((sum, s) => sum + (s.total || 0), 0);
    const average = totalScore / result.subjects.length;
    result.totalScore = totalScore;
    result.average = Number(average.toFixed(2));
    result.resultStatus = average >= 40 ? "Pass" : "Fail";

    await result.save();

    return res.redirect(`/teacher/upload?success=${encodeURIComponent(`Scores saved successfully for ${student.name} (${subject.trim()}: ${subjectTotal}).`)}`);
  } catch (error) {
    console.error("Teacher upload error:", error);
    return res.redirect(`/teacher/upload?error=${encodeURIComponent(error.message || "Failed to save score.")}`);
  }
});

// ==========================================
// 5. REVIEW / VIEW RESULTS
// ==========================================

router.get("/review", requireTeacherAuth, async (req, res) => {
  try {
    const teacher = req.teacher;
    const { class: filterClass, term: filterTerm } = req.query;
    const assignedClasses = teacher.assignedClasses || [];

    const studentFilter = { isArchived: false };
    if (filterClass && filterClass !== "all") {
      studentFilter.classLevel = filterClass;
    } else if (assignedClasses.length > 0) {
      studentFilter.classLevel = { $in: assignedClasses };
    }

    const matchingStudents = await Student.find(studentFilter).select("_id");
    const studentIds = matchingStudents.map((s) => s._id);

    const resultQuery = { student: { $in: studentIds } };
    if (filterTerm && filterTerm !== "all") {
      resultQuery.term = filterTerm;
    }

    const results = await Result.find(resultQuery).populate("student").sort({ createdAt: -1 });

    res.render("teacher/review", {
      title: "View Results - Teacher Portal",
      path: "/teacher/review",
      results,
      assignedClassesList: assignedClasses,
      selectedClass: filterClass || "all",
      selectedTerm: filterTerm || "all",
    });
  } catch (error) {
    console.error("Teacher review error:", error);
    res.render("error", { message: "Failed to load results: " + error.message });
  }
});

// ==========================================
// 6. SETTINGS VIEW & PASSWORD UPDATE
// ==========================================

router.get("/settings", requireTeacherAuth, (req, res) => {
  res.render("teacher/settings", {
    title: "Settings - Teacher Portal",
    path: "/teacher/settings",
    teacher: req.teacher,
    error: req.query.error || null,
    success: req.query.success || null,
  });
});

router.post("/settings/password", requireTeacherAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (!oldPassword || !newPassword || !confirmPassword) {
      return res.redirect(`/teacher/settings?error=${encodeURIComponent("All password fields are required.")}`);
    }

    if (newPassword !== confirmPassword) {
      return res.redirect(`/teacher/settings?error=${encodeURIComponent("New passwords do not match.")}`);
    }

    if (newPassword.length < 6) {
      return res.redirect(`/teacher/settings?error=${encodeURIComponent("New password must be at least 6 characters.")}`);
    }

    const teacher = await User.findById(req.teacher._id).select("+password");
    const isMatch = await teacher.comparePassword(oldPassword);
    if (!isMatch) {
      return res.redirect(`/teacher/settings?error=${encodeURIComponent("Current password is incorrect.")}`);
    }

    teacher.password = newPassword;
    await teacher.save();

    return res.redirect(`/teacher/settings?success=${encodeURIComponent("Password updated successfully.")}`);
  } catch (error) {
    console.error("Teacher password change error:", error);
    return res.redirect(`/teacher/settings?error=${encodeURIComponent(error.message || "Failed to update password.")}`);
  }
});

export default router;
