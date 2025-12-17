const API_URL = '/api/books';

// State
let currentFilters = {
    search: '',
    language: '',
    year: '',
    subject: ''
};

// DOM Elements
const bookGrid = document.getElementById('bookGrid');
const searchInput = document.getElementById('searchInput');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/') {
        fetchBooks();
        setupSearchListener();
    }
});

// --- Fetch & Render ---
async function fetchBooks() {
    // Build query string
    const params = new URLSearchParams();
    if (currentFilters.search) params.append('search', currentFilters.search);
    if (currentFilters.language) params.append('language', currentFilters.language);
    if (currentFilters.year) params.append('year', currentFilters.year);
    if (currentFilters.subject) params.append('subject', currentFilters.subject);

    bookGrid.innerHTML = '<div class="book-card loading" style="grid-column: 1/-1; text-align:center; padding: 2rem;">Loading Archive...</div>';

    try {
        const response = await fetch(`${API_URL}?${params.toString()}`);
        const books = await response.json();
        renderBooks(books);
    } catch (error) {
        console.error('Error fetching books:', error);
        bookGrid.innerHTML = '<p style="text-align:center; color: red;">Failed to load library archive.</p>';
    }
}

function renderBooks(books) {
    bookGrid.innerHTML = '';
    if (books.length === 0) {
        bookGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; font-size: 1.2rem; margin-top: 2rem;">No books found matching criteria.</p>';
        return;
    }

    books.forEach(book => {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.onclick = () => openModal(book);

        // Fallback image if no cover
        const coverSrc = book.coverImage || 'https://via.placeholder.com/220x280?text=No+Cover';

        card.innerHTML = `
            <div class="card-image">
                <img src="${coverSrc}" alt="${book.title}" loading="lazy">
            </div>
            <div class="card-content">
                <h3 class="book-title">${book.title}</h3>
                <p class="book-author">${book.author}</p>
                <div class="book-meta">
                    <span>${book.year || 'N/A'}</span>
                    <span class="tag">${book.language || 'Unknown'}</span>
                </div>
            </div>
        `;
        bookGrid.appendChild(card);
    });
}

// --- Search & Filter ---
function setupSearchListener() {
    if (!searchInput) return;

    // Debounce search
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            fetchBooks();
        }, 500);
    });
}

function executeSearch() {
    if (!searchInput) return;
    currentFilters.search = searchInput.value;
    fetchBooks();
}

function filterBooks(type, value) {
    // Toggle logic: if clicking same filter, turn it off
    if (currentFilters[type] === value) {
        currentFilters[type] = '';
        // Remove active class
        updateFilterUI(type, null);
    } else {
        currentFilters[type] = value;
        updateFilterUI(type, value);
    }
    fetchBooks();
}

function updateFilterUI(type, value) {
    // Find all options of this type
    // This is a simplified UI update logic; strictly specific selectors would be better for scaling
    // But for this project scope, it works if we select by onclick text content match or similar
    // Actually, we can just remove 'active' from all in that group and add to the specific one.

    // Resetting visual state for the group
    const group = document.querySelector(`[onclick*="filterBooks('${type}'"]`).parentNode;
    const options = group.querySelectorAll('.filter-option');
    options.forEach(opt => opt.classList.remove('active'));

    if (value) {
        // Find the one that was clicked
        // Simplest way is strict string match on onclick attribute or text
        // Let's iterate and check the onclick attribute content
        options.forEach(opt => {
            if (opt.getAttribute('onclick').includes(`'${value}'`)) {
                opt.classList.add('active');
            }
        });
    }
}

function resetFilters() {
    currentFilters = {
        search: '',
        language: '',
        year: '',
        subject: ''
    };
    if (searchInput) searchInput.value = '';

    // Clear UI active states
    document.querySelectorAll('.filter-option').forEach(opt => opt.classList.remove('active'));

    fetchBooks();
}

// --- Modal ---
const modal = document.getElementById('bookModal');

function openModal(book) {
    if (!modal) return;

    document.getElementById('modalImage').src = book.coverImage || 'https://via.placeholder.com/220x280?text=No+Cover';
    document.getElementById('modalTitle').textContent = book.title;
    document.getElementById('modalAuthor').textContent = `by ${book.author}`;
    document.getElementById('modalYear').textContent = book.year || 'Unknown Year';
    document.getElementById('modalLanguage').textContent = book.language || 'Unknown Language';
    document.getElementById('modalDesc').textContent = book.description || 'No description available.';

    const downloadBtn = document.getElementById('downloadBtn');
    downloadBtn.href = book.fileUrl; // Serves the file from backend

    // Tags
    const tagsContainer = document.getElementById('modalTags');
    tagsContainer.innerHTML = '';
    if (book.subjects && book.subjects.length > 0) {
        book.subjects.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.style.marginRight = '0.5rem';
            span.textContent = tag;
            tagsContainer.appendChild(span);
        });
    }

    modal.classList.add('active');
}

function closeModal() {
    if (modal) modal.classList.remove('active');
}

// Close modal on outside click
window.onclick = function (event) {
    if (event.target == modal) {
        closeModal();
    }
}

// --- Upload Handling (Admin) ---
async function handleUpload(event) {
    event.preventDefault();
    const form = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submitBtn');
    const message = document.getElementById('message');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
    message.textContent = '';

    const formData = new FormData(form);
    const token = localStorage.getItem('adminToken'); // Get token

    try {
        const response = await fetch('/api/books', {
            method: 'POST',
            headers: {
                'x-admin-token': token || '' // Add custom header
            },
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            message.style.color = 'green';
            message.textContent = 'Book uploaded successfully! Redirecting...';
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1500);
        } else if (response.status === 401 || response.status === 403) {
            throw new Error('Unauthorized. Please login again.');
        } else {
            const err = await response.json();
            throw new Error(err.message || 'Upload failed');
        }
    } catch (error) {
        message.style.color = 'red';
        message.textContent = 'Error: ' + error.message;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload to Archive';

        if (error.message.includes('Unauthorized')) {
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        }
    }
}

// --- Admin Authentication ---
async function handleLogin(event) {
    event.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const message = document.getElementById('loginMessage');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('adminToken', data.token);
            window.location.href = 'admin.html';
        } else {
            message.textContent = data.message || 'Login failed';
        }
    } catch (error) {
        console.error('Login error:', error);
        message.textContent = 'Server error during login.';
    }
}

// Check auth on admin page
if (window.location.pathname.endsWith('admin.html')) {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'login.html';
    }
}

// Logout function
function logout() {
    localStorage.removeItem('adminToken');
    window.location.href = 'index.html';
}

// --- Security: Disable Right-Click & Shortcuts ---
document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    alert("Sorry, right click is disabled!");
});

document.onkeydown = function (e) {
    if (e.keyCode == 123) { // Disable F12
        return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) { // Disable Ctrl+Shift+I
        return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) { // Disable Ctrl+Shift+C
        return false;
    }
    if (e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) { // Disable Ctrl+Shift+J
        return false;
    }
    if (e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) { // Disable Ctrl+U
        return false;
    }
    if (e.ctrlKey && e.keyCode == 'S'.charCodeAt(0)) { // Disable Ctrl+S
        return false;
    }
};
