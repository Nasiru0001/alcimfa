import mongoose from "mongoose";
import Result from "../models/resultModel.js";
import Student from "../models/studentModel.js";

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

// Helper to calculate grade and remark based on total score (out of 100)
const computeGradeAndRemark = (total) => {
  if (total >= 70) return { grade: "A", remark: "Excellent" };
  if (total >= 60) return { grade: "B", remark: "Very Good" };
  if (total >= 50) return { grade: "C", remark: "Good" };
  if (total >= 40) return { grade: "D", remark: "Fair" };
  return { grade: "F", remark: "Poor" };
};

// Helper to calculate GPA based on average score
const computeGPA = (average) => {
  if (average >= 70) return "4.00";
  if (average >= 60) return "3.00";
  if (average >= 50) return "2.00";
  if (average >= 40) return "1.00";
  return "0.00";
};

// @desc Upload student result / CA and Exam scores
// @route POST /api/results or POST /api/scores
export const uploadResult = async (req, res) => {
  try {
    // 1. Defensive check for missing body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, message: "Request body is missing" });
    }

    const { studentId, regNumber, term, session, subjects, headRemark, teacherRemark } = req.body;
    const identifier = studentId || regNumber;

    if (!identifier || !term || !session) {
      return res.status(400).json({ 
        success: false, 
        message: "Student identifier (studentId or regNumber), term, and session are required" 
      });
    }

    if (!subjects || !Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "At least one subject score object is required in the 'subjects' array" 
      });
    }

    // 2. Mongoose query: Verify that the student exists in MongoDB (by ObjectId or regNumber)
    const student = await findStudentByIdOrReg(identifier);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 3. Teacher Scope Authorization: Enforce assigned classes and subjects
    if (req.user && req.user.role === "teacher") {
      if (req.user.assignedClasses && req.user.assignedClasses.length > 0) {
        if (!req.user.assignedClasses.includes(student.classLevel)) {
          return res.status(403).json({
            success: false,
            message: `Access denied. You are only authorized to upload scores for your assigned classes: [${req.user.assignedClasses.join(", ")}]. Student is in ${student.classLevel}.`
          });
        }
      }
      if (req.user.assignedSubjects && req.user.assignedSubjects.length > 0) {
        for (const s of subjects) {
          if (!req.user.assignedSubjects.includes(s.name)) {
            return res.status(403).json({
              success: false,
              message: `Access denied. You are not authorized to grade subject '${s.name}'. Your assigned subjects: [${req.user.assignedSubjects.join(", ")}].`
            });
          }
        }
      }
    }

    // 4. Mongoose query: Check for existing result to prevent duplicate term/session entries
    const existingResult = await Result.findOne({ student: student._id, term: term.trim(), session: session.trim() });
    if (existingResult) {
      return res.status(400).json({
        success: false,
        message: `Result for ${term} (${session}) already exists for this student. Use PUT /api/scores/${existingResult._id} to update existing scores.`,
        existingResultId: existingResult._id
      });
    }

    // 5. CA and Exam Score Validation & Subject Grading
    let totalScore = 0;
    const gradedSubjects = [];

    for (const s of subjects) {
      if (!s.name) {
        return res.status(400).json({ success: false, message: "Each subject must have a 'name' field" });
      }

      let ca1Score = 0;
      let ca2Score = 0;

      // Handle single 'ca' field (0 to 40 max) or discrete 'ca1' & 'ca2' (each 0 to 20, sum <= 40)
      if (s.ca !== undefined) {
        const caVal = Number(s.ca);
        if (isNaN(caVal) || caVal < 0 || caVal > 40) {
          return res.status(400).json({ 
            success: false, 
            message: `Continuous Assessment (CA) score for ${s.name} must be between 0 and 40. Received: ${s.ca}` 
          });
        }
        ca1Score = caVal;
        ca2Score = 0;
      } else {
        const ca1Val = Number(s.ca1 ?? 0);
        const ca2Val = Number(s.ca2 ?? 0);
        if (isNaN(ca1Val) || ca1Val < 0 || ca1Val > 20) {
          return res.status(400).json({ 
            success: false, 
            message: `CA1 score for ${s.name} must be between 0 and 20. Received: ${s.ca1}` 
          });
        }
        if (isNaN(ca2Val) || ca2Val < 0 || ca2Val > 20) {
          return res.status(400).json({ 
            success: false, 
            message: `CA2 score for ${s.name} must be between 0 and 20. Received: ${s.ca2}` 
          });
        }
        if (ca1Val + ca2Val > 40) {
          return res.status(400).json({
            success: false,
            message: `Total CA score (CA1 + CA2) for ${s.name} cannot exceed 40. Received: ${ca1Val + ca2Val}`
          });
        }
        ca1Score = ca1Val;
        ca2Score = ca2Val;
      }

      // Exam score validation (0 to 70 max)
      const examVal = Number(s.exam ?? 0);
      if (isNaN(examVal) || examVal < 0 || examVal > 70) {
        return res.status(400).json({ 
          success: false, 
          message: `Exam score for ${s.name} must be between 0 and 70. Received: ${s.exam}` 
        });
      }

      const subjectTotal = ca1Score + ca2Score + examVal;
      if (subjectTotal > 100) {
        return res.status(400).json({ 
          success: false, 
          message: `Total score for ${s.name} cannot exceed 100. Received: ${subjectTotal}` 
        });
      }

      const { grade, remark } = computeGradeAndRemark(subjectTotal);
      totalScore += subjectTotal;

      gradedSubjects.push({
        name: s.name.trim(),
        ca1: ca1Score,
        ca2: ca2Score,
        exam: examVal,
        total: subjectTotal,
        grade,
        remark
      });
    }

    const average = totalScore / gradedSubjects.length;
    const gpa = computeGPA(average);
    const resultStatus = average >= 40 ? "Pass" : "Fail";

    // 6. Mongoose query: Persist new Result document to MongoDB linking student._id
    const result = await Result.create({
      student: student._id,
      term: term.trim(),
      session: session.trim(),
      subjects: gradedSubjects,
      totalScore,
      average: Number(average.toFixed(2)),
      gpa: Number(gpa),
      resultStatus,
      headRemark: headRemark ? headRemark.trim() : "",
      teacherRemark: teacherRemark ? teacherRemark.trim() : "",
    });

    return res.status(201).json({
      success: true,
      message: "Result uploaded successfully",
      result
    });

  } catch (error) {
    console.error("Error in uploadResult:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to upload result" 
    });
  }
};


// @desc Update student result / scores
// @route PUT /api/results/:id or PUT /api/scores/:id
export const updateResult = async (req, res) => {
  try {
    const { id } = req.params;
    const { subjects, headRemark, teacherRemark, term, session } = req.body;

    // 1. Mongoose query: Find result by ID and populate associated student
    const result = await Result.findById(id).populate("student");
    if (!result) {
      return res.status(404).json({ success: false, message: "Result record not found" });
    }

    const student = result.student;

    // 2. Teacher Scope Authorization: Enforce assigned classes and subjects
    if (req.user && req.user.role === "teacher") {
      if (req.user.assignedClasses && req.user.assignedClasses.length > 0 && student) {
        if (!req.user.assignedClasses.includes(student.classLevel)) {
          return res.status(403).json({
            success: false,
            message: `Access denied. You are only authorized to modify scores for: [${req.user.assignedClasses.join(", ")}]. Student is in ${student.classLevel}.`
          });
        }
      }
      if (req.user.assignedSubjects && req.user.assignedSubjects.length > 0 && Array.isArray(subjects)) {
        for (const s of subjects) {
          if (!req.user.assignedSubjects.includes(s.name)) {
            return res.status(403).json({
              success: false,
              message: `Access denied. You are not authorized to grade subject '${s.name}'. Your assigned subjects: [${req.user.assignedSubjects.join(", ")}].`
            });
          }
        }
      }
    }

    // 3. Process and validate updated subjects if provided
    if (subjects && Array.isArray(subjects) && subjects.length > 0) {
      let totalScore = 0;
      const gradedSubjects = [];

      for (const s of subjects) {
        if (!s.name) {
          return res.status(400).json({ success: false, message: "Each subject must have a 'name' field" });
        }

        let ca1Score = 0;
        let ca2Score = 0;

        if (s.ca !== undefined) {
          const caVal = Number(s.ca);
          if (isNaN(caVal) || caVal < 0 || caVal > 40) {
            return res.status(400).json({ 
              success: false, 
              message: `Continuous Assessment (CA) score for ${s.name} must be between 0 and 40. Received: ${s.ca}` 
            });
          }
          ca1Score = caVal;
          ca2Score = 0;
        } else {
          const ca1Val = Number(s.ca1 ?? 0);
          const ca2Val = Number(s.ca2 ?? 0);
          if (isNaN(ca1Val) || ca1Val < 0 || ca1Val > 20) {
            return res.status(400).json({ 
              success: false, 
              message: `CA1 score for ${s.name} must be between 0 and 20. Received: ${s.ca1}` 
            });
          }
          if (isNaN(ca2Val) || ca2Val < 0 || ca2Val > 20) {
            return res.status(400).json({ 
              success: false, 
              message: `CA2 score for ${s.name} must be between 0 and 20. Received: ${s.ca2}` 
            });
          }
          if (ca1Val + ca2Val > 40) {
            return res.status(400).json({
              success: false,
              message: `Total CA score (CA1 + CA2) for ${s.name} cannot exceed 40. Received: ${ca1Val + ca2Val}`
            });
          }
          ca1Score = ca1Val;
          ca2Score = ca2Val;
        }

        const examVal = Number(s.exam ?? 0);
        if (isNaN(examVal) || examVal < 0 || examVal > 70) {
          return res.status(400).json({ 
            success: false, 
            message: `Exam score for ${s.name} must be between 0 and 70. Received: ${s.exam}` 
          });
        }

        const subjectTotal = ca1Score + ca2Score + examVal;
        if (subjectTotal > 100) {
          return res.status(400).json({ 
            success: false, 
            message: `Total score for ${s.name} cannot exceed 100. Received: ${subjectTotal}` 
          });
        }

        const { grade, remark } = computeGradeAndRemark(subjectTotal);
        totalScore += subjectTotal;

        gradedSubjects.push({
          name: s.name.trim(),
          ca1: ca1Score,
          ca2: ca2Score,
          exam: examVal,
          total: subjectTotal,
          grade,
          remark
        });
      }

      const average = totalScore / gradedSubjects.length;
      const gpa = computeGPA(average);

      result.subjects = gradedSubjects;
      result.totalScore = totalScore;
      result.average = Number(average.toFixed(2));
      result.gpa = Number(gpa);
      result.resultStatus = average >= 40 ? "Pass" : "Fail";
    }

    if (headRemark !== undefined) result.headRemark = headRemark.trim();
    if (teacherRemark !== undefined) result.teacherRemark = teacherRemark.trim();
    if (term) result.term = term.trim();
    if (session) result.session = session.trim();

    // 4. Mongoose query: Save updated Result document to MongoDB
    await result.save();

    return res.status(200).json({
      success: true,
      message: "Scores updated successfully",
      result
    });

  } catch (error) {
    console.error("Error in updateResult:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to update scores" 
    });
  }
};

// Get student result JSON
export const getStudentResult = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query; // e.g. ?term=First Term&session=2024/2025

    // Mongoose query: Resolve student document by ObjectId or regNumber
    const student = await findStudentByIdOrReg(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const query = { student: student._id };
    if (term) query.term = term;
    if (session) query.session = session;

    // Mongoose query: Find result matching student._id, term, and session
    const result = await Result.findOne(query).populate("student");

    if (!result) {
      return res.status(404).json({ success: false, message: "No result found" });
    }

    return res.json({ success: true, result });
  } catch (err) {
    console.error("Error in getStudentResult:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Render EJS report card with student photo
export const renderResultCard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, session } = req.query; // ✅ get from query string

    // Mongoose query: Resolve student document by ObjectId or regNumber
    const student = await findStudentByIdOrReg(studentId);
    if (!student) {
      return res.status(404).render("error", { message: "Student not found" });
    }

    const query = { student: student._id };
    if (term) query.term = term;
    if (session) query.session = session;

    // Mongoose query: Find result matching student._id, term, and session
    const result = await Result.findOne(query).populate("student");

    if (!result) {
      return res.status(404).render("error", { message: "No result found" });
    }

    const maxMarks = result.subjects.length * 100;
    const totalInWords = convertNumberToWords(result.totalScore);

    const reportData = {
      student: {
        name: result.student.name,
        admissionNo: result.student.regNumber,
        class: result.student.classLevel,
        gender: result.student.gender,
        session: result.student.session,
        photo: result.student.profilePhoto || null,
      },
      term: result.term,
      session: result.session,
      subjects: result.subjects,
      summary: {
        grandTotal: result.totalScore,
        maxMarks,
        average: result.average,
        gpa: result.gpa,
        totalInWords,
        resultStatus: result.resultStatus,
      },
      remarks: {
        teacher: result.teacherRemark || "",
        headOfSchool: result.headRemark || "",
      },
      gradingScale: [
        { grade: "A", min: "70%", max: "100%" },
        { grade: "B", min: "60%", max: "69%" },
        { grade: "C", min: "50%", max: "59%" },
        { grade: "D", min: "40%", max: "49%" },
        { grade: "F", min: "0%", max: "39%" },
      ],
    };

    res.render("reportCard", reportData);
  } catch (err) {
    res.status(500).render("error", { message: "Error loading report card" });
  }
};

/**
 * ----------------------------------------------------
 * VIEW ALL RESULTS (Render EJS page with table)
 * ----------------------------------------------------
 */
export const viewAllResults = async (req, res) => {
  try {
    const results = await Result.find()
      .populate('student')
      .sort({ createdAt: -1 });

    console.log('📊 Total results found:', results.length);

    // Debug: Check what's in the results
    results.forEach((result, index) => {
      console.log(`Result ${index + 1}:`, {
        resultId: result._id,
        studentId: result.student ? result.student._id : 'MISSING',
        studentName: result.student ? result.student.name : 'STUDENT NOT FOUND',
        term: result.term
      });
    });

    // Filter out any results with missing student
    const validResults = results.filter(r => r.student);
    console.log('✅ Valid results (with students):', validResults.length);

    // Transform data to match your template structure
    const formattedResults = validResults.map(result => ({
  student: {
    _id: result.student._id,
    name: result.student.name,
    classLevel: result.student.classLevel,
    profilePhoto: result.student.profilePhoto // ✅ ADD THIS
  },
  term: result.term,
  session: result.session,
  totalScore: result.totalScore,
  average: result.average,
  gpa: result.gpa,
  resultStatus: result.resultStatus,
  subjects: result.subjects
}));
    console.log('📦 Formatted results:', formattedResults.length);

    return res.render('admin/view-results', { 
      title: 'View Results',
      admin: req.admin || null,
      adminToken: req.session?.adminToken || null,
      results: formattedResults 
    });

  } catch (error) {
    console.error('❌ View All Results Error:', error);
    return res.render('admin/view-results', { 
      title: 'View Results',
      admin: null,
      adminToken: null,
      results: []
    });
  }
};

// Number to words
function convertNumberToWords(num) {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];

  if (num === 0) return "Zero";

  let words = "";

  if (num >= 1000) {
    words += ones[Math.floor(num / 1000)] + " Thousand ";
    num %= 1000;
  }
  if (num >= 100) {
    words += ones[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }
  if (num >= 20) {
    words += tens[Math.floor(num / 10)] + " ";
    num %= 10;
  } else if (num >= 10) {
    words += teens[num - 10] + " ";
    return words.trim();
  }

  if (num > 0) words += ones[num] + " ";

  return words.trim();
}
