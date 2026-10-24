import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import streamifier from "streamifier";
import dotenv from "dotenv";

dotenv.config();

// ==========================================
// CLOUDINARY V2 CONFIGURATION
// Prioritize CLOUDINARY_URL with fallback to individual credentials.
// Always enforce secure (HTTPS) URLs to prevent mixed content issues.
// ==========================================
if (process.env.CLOUDINARY_URL) {
  // cloudinary.config(true) parses process.env.CLOUDINARY_URL into cloud_name, api_key, api_secret
  cloudinary.config(true);
  cloudinary.config({
    secure: true,
  });
} else if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  console.warn("⚠️ Warning: Cloudinary credentials or CLOUDINARY_URL not found in environment variables.");
}

// ==========================================
// MULTER MEMORY STORAGE CONFIGURATION
// Holds uploaded files in RAM buffer for direct streaming to Cloudinary.
// ==========================================
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB maximum file size
  },
  fileFilter: (req, file, cb) => {
    // Restrict uploads strictly to image MIME types
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed (JPEG, PNG, WEBP, etc.)"), false);
    }
    cb(null, true);
  },
});

// ==========================================
// HELPER: Upload memory buffer to Cloudinary
// - unique_filename: true & use_filename: false ensure unique public IDs,
//   preventing image overwriting / photo mismatch issues.
// - Returns the upload result (including result.secure_url).
// ==========================================
export const uploadToCloudinary = (buffer, folder = "students") => {
  return new Promise((resolve, reject) => {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return reject(new Error("Invalid or empty file buffer provided for Cloudinary upload"));
    }

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        unique_filename: true,
        use_filename: false,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ==========================================
// HELPER: Extract public ID from Cloudinary URL
// Matches the folder and asset name (e.g., "students/a1b2c3d4")
// ==========================================
export const extractPublicId = (url) => {
  if (!url || typeof url !== "string") return null;
  // Match public ID after /upload/ (skipping optional transformation segments and optional version prefix) up to extension
  const match = url.match(/\/upload\/(?:(?:[a-z]_[^/]+,?)+\/)?(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+(?:\?.*)?$/i);
  if (match) return match[1];
  const fallback = url.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
  return fallback ? fallback[1] : null;
};

// ==========================================
// HELPER: Delete asset from Cloudinary by public ID
// ==========================================
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  return cloudinary.uploader.destroy(publicId);
};

export default cloudinary;

