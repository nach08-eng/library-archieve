const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    index: true
  },
  author: {
    type: String,
    required: true,
    index: true
  },
  description: String,
  language: String,
  year: Number,
  subjects: [String],
  fileUrl: {
    type: String,
    required: true
  },
  coverImage: String,
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

// Create text index for search
BookSchema.index({ title: 'text', author: 'text', subjects: 'text' });

module.exports = mongoose.model('Book', BookSchema);
