import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import MongoStore from "connect-mongo";

// Import API routes
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import resultRoutes from "./routes/resultRoutes.js";
import userRoutes from "./routes/userRoutes.js";

// Import VIEW route
import adminViewRoutes from "./routes/adminViewRoutes.js";
import userViewRoutes from "./routes/userViewRoutes.js";
import connectDB from "./config/db.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan("dev"));

// MongoDB URI
const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/myDatabase';

// Session middleware with MongoDB store
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: uri }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Make session data available to all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = req.session.admin || null;
  next();
});

// Set EJS as view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/results", resultRoutes);

// VIEW Routes
app.use("/admin", adminViewRoutes);
app.use("/user", userViewRoutes);

// Root routes (public pages)
app.get("/", (req, res) => {
  res.render("public/index", { title: "Home" });
});

app.get("/about", (req, res) => {
  res.render("public/about", { title: "About" });
});

app.get("/check-result", (req, res) => {
  res.render("public/check-result", { title: "Check result" });
});

app.get("/contact", (req, res) => {
  res.render("public/contact", { title: "Contact" });
});

// Connect to MongoDB

await connectDB();

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    message: "Page not found",
    error: { status: 404 }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { 
    message: "Something went wrong!",
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
