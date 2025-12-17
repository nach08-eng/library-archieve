const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');
const Book = require('./models/Book');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Determine Mode
const IS_CLOUD = !!(process.env.MONGODB_URI && process.env.AWS_BUCKET_NAME);
console.log(`Starting server in ${IS_CLOUD ? 'CLOUD (MongoDB + S3)' : 'LOCAL (JSON + File System)'} mode.`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ============================================================================
// CLOUD CONFIGURATION (MongoDB + S3)
// ============================================================================
let uploadCloud;
if (IS_CLOUD) {
    // MongoDB Connection
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('MongoDB connected'))
        .catch(err => console.error('MongoDB connection error:', err));

    // S3 Configuration
    const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
    });

    // Multer S3
    uploadCloud = multer({
        storage: multerS3({
            s3: s3,
            bucket: process.env.AWS_BUCKET_NAME,
            acl: 'public-read',
            contentType: multerS3.AUTO_CONTENT_TYPE,
            metadata: (req, file, cb) => cb(null, { fieldName: file.fieldname }),
            key: (req, file, cb) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, `uploads/${uniqueSuffix}${path.extname(file.originalname)}`);
            }
        })
    });
}

// ============================================================================
// LOCAL CONFIGURATION (JSON + File System)
// ============================================================================
const DATA_FILE = path.join(__dirname, 'data', 'books.json');
let uploadLocal;

if (!IS_CLOUD) {
    // Ensure directories exist
    const uploadDir = path.join(__dirname, 'uploads');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

    // Multer Local
    const storageLocal = multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, uniqueSuffix + path.extname(file.originalname));
        }
    });
    uploadLocal = multer({ storage: storageLocal });
}

// Helper for Local Data
const getLocalBooks = () => {
    try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
    catch { return []; }
};
const saveLocalBooks = (books) => fs.writeFileSync(DATA_FILE, JSON.stringify(books, null, 2), 'utf8');


// ============================================================================
// API ROUTES
// ============================================================================

// Select appropriate uploader
const upload = IS_CLOUD ? uploadCloud : uploadLocal;

// Upload Book


// Admin Login Route
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    // Simple hardcoded password for demonstration. In production, use env vars.
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

    if (password === ADMIN_PASSWORD) {
        // Return a simple token
        return res.json({ success: true, token: 'admin-secret-access' });
    }
    return res.status(401).json({ success: false, message: 'Invalid password' });
});

// Auth Middleware
const requireAdmin = (req, res, next) => {
    const token = req.headers['x-admin-token'];
    if (token === 'admin-secret-access') {
        next();
    } else {
        res.status(403).json({ message: 'Unauthorized. Admin access required.' });
    }
};

// Upload Book (Protected)
app.post('/api/books', requireAdmin, upload.fields([{ name: 'bookFile', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), async (req, res) => {
    try {
        const { title, author, description, language, year, subjects } = req.body;

        const bookFile = req.files['bookFile'] ? req.files['bookFile'][0] : null;
        const coverImage = req.files['coverImage'] ? req.files['coverImage'][0] : null;

        if (!bookFile) return res.status(400).json({ message: 'Book file is required' });

        // Parse subjects
        let parsedSubjects = [];
        if (subjects) {
            parsedSubjects = Array.isArray(subjects) ? subjects : subjects.split(',').map(s => s.trim());
        }

        if (IS_CLOUD) {
            // --- CLOUD MODE REQ ---
            const newBook = new Book({
                title, author, description, language,
                year: year ? parseInt(year) : null,
                subjects: parsedSubjects,
                fileUrl: bookFile.location, // S3 URL
                coverImage: coverImage ? coverImage.location : null,
                uploadedAt: new Date()
            });
            const savedBook = await newBook.save();
            return res.status(201).json(savedBook);

        } else {
            // --- LOCAL MODE REQ ---
            const newBook = {
                _id: Date.now().toString(),
                title, author, description, language,
                year: year ? parseInt(year) : null,
                subjects: parsedSubjects,
                fileUrl: `/uploads/${bookFile.filename}`,
                coverImage: coverImage ? `/uploads/${coverImage.filename}` : null,
                uploadedAt: new Date().toISOString()
            };
            const books = getLocalBooks();
            books.push(newBook);
            saveLocalBooks(books);
            return res.status(201).json(newBook);
        }

    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: 'Server error during upload', error: error.message });
    }
});

// Get Books
app.get('/api/books', async (req, res) => {
    try {
        const { search, language, year, subject } = req.query;

        if (IS_CLOUD) {
            // --- CLOUD MODE REQ ---
            let query = {};
            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { author: { $regex: search, $options: 'i' } }
                ];
            }
            if (language) query.language = language;
            if (year) query.year = parseInt(year);
            if (subject) query.subjects = subject;

            const books = await Book.find(query).sort({ uploadedAt: -1 });
            return res.json(books);

        } else {
            // --- LOCAL MODE REQ ---
            let books = getLocalBooks();
            if (search) {
                const searchLower = search.toLowerCase();
                books = books.filter(b =>
                    (b.title && b.title.toLowerCase().includes(searchLower)) ||
                    (b.author && b.author.toLowerCase().includes(searchLower))
                );
            }
            if (language) books = books.filter(b => b.language === language);
            if (year) books = books.filter(b => b.year === parseInt(year));
            if (subject) books = books.filter(b => b.subjects && b.subjects.includes(subject));

            books.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
            return res.json(books);
        }

    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ message: 'Error fetching books' });
    }
});

// Get Single Book
app.get('/api/books/:id', async (req, res) => {
    try {
        if (IS_CLOUD) {
            // --- CLOUD MODE REQ ---
            const book = await Book.findById(req.params.id);
            if (!book) return res.status(404).json({ message: 'Book not found' });
            return res.json(book);

        } else {
            // --- LOCAL MODE REQ ---
            const books = getLocalBooks();
            const book = books.find(b => b._id === req.params.id);
            if (!book) return res.status(404).json({ message: 'Book not found' });
            return res.json(book);
        }

    } catch (error) {
        if (error.name === 'CastError') return res.status(404).json({ message: 'Book not found' });
        res.status(500).json({ message: 'Error fetching book details' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Mode: ${IS_CLOUD ? 'CLOUD (Production Ready)' : 'LOCAL (Development)'}`);
});
