const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_FILE = path.join(__dirname, 'data', 'books.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ensure directories exist
const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

// Helper: Read/Write Data
const getBooks = () => {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
};

const saveBooks = (books) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(books, null, 2), 'utf8');
};

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// API Routes

// Upload Book
app.post('/api/books', upload.fields([{ name: 'bookFile', maxCount: 1 }, { name: 'coverImage', maxCount: 1 }]), (req, res) => {
    try {
        const { title, author, description, language, year, subjects } = req.body;

        let parsedSubjects = [];
        if (subjects) {
            parsedSubjects = subjects.split(',').map(s => s.trim());
        }

        const bookFile = req.files['bookFile'] ? req.files['bookFile'][0] : null;
        const coverImage = req.files['coverImage'] ? req.files['coverImage'][0] : null;

        if (!bookFile) {
            return res.status(400).json({ message: 'Book file is required' });
        }

        const newBook = {
            _id: Date.now().toString(), // Simple ID generation
            title,
            author,
            description,
            language,
            year: year ? parseInt(year) : null,
            subjects: parsedSubjects,
            fileUrl: `/uploads/${bookFile.filename}`,
            coverImage: coverImage ? `/uploads/${coverImage.filename}` : null,
            uploadedAt: new Date().toISOString()
        };

        const books = getBooks();
        books.push(newBook);
        saveBooks(books);

        res.status(201).json(newBook);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error during upload' });
    }
});

// Get Books with Filter & Search
app.get('/api/books', (req, res) => {
    try {
        const { search, language, year, subject } = req.query;
        let books = getBooks();

        // Filter
        if (search) {
            const searchLower = search.toLowerCase();
            books = books.filter(b =>
                (b.title && b.title.toLowerCase().includes(searchLower)) ||
                (b.author && b.author.toLowerCase().includes(searchLower))
            );
        }

        if (language) {
            books = books.filter(b => b.language === language);
        }

        if (year) {
            books = books.filter(b => b.year === parseInt(year));
        }

        if (subject) {
            books = books.filter(b => b.subjects && b.subjects.includes(subject));
        }

        // Sort by uploadedAt desc
        books.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

        res.json(books);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching books' });
    }
});

// Get Single Book
app.get('/api/books/:id', (req, res) => {
    try {
        const books = getBooks();
        const book = books.find(b => b._id === req.params.id);
        if (!book) return res.status(404).json({ message: 'Book not found' });
        res.json(book);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching book details' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`NOTE: Running in local file mode (data/books.json). MongoDB not required.`);
});
