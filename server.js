const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');
const Book = require('./models/Book');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// check for environment variables
if (!process.env.MONGODB_URI || !process.env.AWS_BUCKET_NAME) {
    console.warn("WARNING: Missing MONGODB_URI or AWS_BUCKET_NAME credentials. App may crash or fail to upload.");
}

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

// Multer S3 Storage configuration
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        acl: 'public-read', // Ensure your bucket allows public ACLs or use a different policy
        contentType: multerS3.AUTO_CONTENT_TYPE,
        metadata: function (req, file, cb) {
            cb(null, { fieldName: file.fieldname });
        },
        key: function (req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, `uploads/${uniqueSuffix}${ext}`);
        }
    })
});

// API Routes

// Upload Book
app.post('/api/books', upload.fields([{ name: 'bookFile', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), async (req, res) => {
    try {
        const { title, author, description, language, year, subjects } = req.body;

        const bookFile = req.files['bookFile'] ? req.files['bookFile'][0] : null;
        const coverImage = req.files['coverImage'] ? req.files['coverImage'][0] : null;

        if (!bookFile) {
            return res.status(400).json({ message: 'Book file is required' });
        }

        let parsedSubjects = [];
        if (subjects) {
            if (Array.isArray(subjects)) {
                parsedSubjects = subjects;
            } else {
                // If it's a string, split it
                parsedSubjects = subjects.split(',').map(s => s.trim());
            }
        }

        // Create new Book document
        const newBook = new Book({
            title,
            author,
            description,
            language,
            year: year ? parseInt(year) : null,
            subjects: parsedSubjects,
            fileUrl: bookFile.location, // S3 URL from multer-s3
            coverImage: coverImage ? coverImage.location : null,
            uploadedAt: new Date()
        });

        const savedBook = await newBook.save();
        res.status(201).json(savedBook);
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ message: 'Server error during upload', error: error.message });
    }
});

// Get Books with Filter & Search
app.get('/api/books', async (req, res) => {
    try {
        const { search, language, year, subject } = req.query;
        let query = {};

        if (search) {
            // Case-insensitive regex search for title or author
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { author: { $regex: search, $options: 'i' } }
            ];
        }

        if (language) {
            query.language = language;
        }

        if (year) {
            query.year = parseInt(year);
        }

        if (subject) {
            // Mongoose query for array containment: matches if subjects array contains the string
            query.subjects = subject;
        }

        // Sort by uploadedAt descending
        const books = await Book.find(query).sort({ uploadedAt: -1 });
        res.json(books);
    } catch (error) {
        console.error("Fetch error:", error);
        res.status(500).json({ message: 'Error fetching books' });
    }
});

// Get Single Book
app.get('/api/books/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book);
    } catch (error) {
        console.error("Fetch single error:", error);
        // Handle invalid ID format (CastError)
        if (error.name === 'CastError') {
            return res.status(404).json({ message: 'Book not found' });
        }
        res.status(500).json({ message: 'Error fetching book details' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Updated: Using MongoDB and AWS S3 storage.`);
});
