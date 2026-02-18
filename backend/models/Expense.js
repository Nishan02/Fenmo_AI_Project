// backend/models/Expense.js
const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Linked to User
  amount: { type: Number, required: true },
  category: { type: String, required: true, index: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  idempotencyKey: { type: String, required: true, unique: true }
}, { timestamps: true });

// Add a compound index to ensure idempotency is unique PER user
ExpenseSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model('Expense', ExpenseSchema);