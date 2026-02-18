// backend/models/Expense.js
const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Linked to User
  amount: { type: Number, required: true, min: 0.01 },
  category: { type: String, required: true, index: true, trim: true },
  description: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  idempotencyKey: { type: String, required: true, trim: true }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

// Add a compound index to ensure idempotency is unique PER user
ExpenseSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
ExpenseSchema.index({ user: 1, category: 1, date: -1 });

module.exports = mongoose.model('Expense', ExpenseSchema);
