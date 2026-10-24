import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: {
        values: ["student", "parent", "teacher"],
        message: "Role must be either student, parent, or teacher",
      },
      default: "student",
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      // Required only for students and parents
      required: function() {
        return this.role === "student" || this.role === "parent";
      },
    },
    assignedClasses: {
      type: [String],
      default: [],
    },
    assignedSubjects: {
      type: [String],
      default: [],
    },
    phoneNumber: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update last login
userSchema.methods.updateLastLogin = async function () {
  this.lastLogin = new Date();
  await this.save({ validateBeforeSave: false });
};

// Virtual for full profile with student details
userSchema.virtual("profile").get(function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    assignedClasses: this.assignedClasses,
    assignedSubjects: this.assignedSubjects,
    phoneNumber: this.phoneNumber,
    isActive: this.isActive,
    lastLogin: this.lastLogin,
  };
});

// Index for faster queries
userSchema.index({ role: 1 });
userSchema.index({ student: 1 });

const User = mongoose.model("User", userSchema);
export default User;