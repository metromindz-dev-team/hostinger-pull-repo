import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/documents');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const announcementStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/announcements');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err, uploadDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'announcement-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const ALLOWED_EXTS = /\.(jpeg|jpg|png|webp|heic|heif|pdf|doc|docx)$/i;
const ALLOWED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence', 'image/x-heic', 'image/x-heif',
  'application/pdf',
  'application/msword',                                                          // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',    // .docx
]);

const fileFilter = (req, file, cb) => {
  const extOk = ALLOWED_EXTS.test(path.extname(file.originalname || ''));
  const mimeOk = ALLOWED_MIMES.has(file.mimetype) || (file.mimetype && file.mimetype.startsWith('image/'));
  if (extOk || mimeOk) {
    return cb(null, true);
  }
  cb(new Error('Only images (JPEG/PNG/WEBP/HEIC) and documents (PDF/DOC/DOCX) are allowed'));
};

export const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit for modern mobile camera photos
  fileFilter
});

export const uploadAnnouncements = multer({
  storage: announcementStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter
});

export const uploadFields = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'panCard', maxCount: 1 },
  { name: 'aadhaarCard', maxCount: 1 },
  { name: 'photograph', maxCount: 1 },
  { name: 'bankPassbook', maxCount: 1 },
  { name: 'educationCertificates', maxCount: 5 },
  { name: 'experienceLetter', maxCount: 1 },
  { name: 'proofOfAddress', maxCount: 1 },
  { name: 'proofOfDOB', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 },
  { name: 'incomeTaxDeclaration', maxCount: 1 },

]);
