import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import the actual Admin model
import Admin from './models/adminModel.js'; 

const MONGODB_URI = process.env.MONGODB_URI;

async function seedAdmin() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB!");

    const email = "admin@example.com";
    const plainPassword = "yourAdminPassword";

    // Clean up any old attempt
    await Admin.deleteOne({ email });

    // Notice we pass plainPassword directly because adminSchema.pre('save') handles bcrypt
    const admin = new Admin({
      name: "Super Admin",
      email: email,
      password: plainPassword
    });

    await admin.save();
    console.log("-----------------------------------------");
    console.log("🎉 Real Admin Account Created!");
    console.log(`📧 Email:    ${email}`);
    console.log(`🔑 Password: ${plainPassword}`);
    console.log("-----------------------------------------");

  } catch (error) {
    console.error("Error creating admin:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

seedAdmin();