// backend/routes/expenses.js
const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');

// GET /expenses - List, filter, and sort
router.get('/', async (req, res) => {
  try {
    const { category, sort } = req.query;
    let query = {};
    
    if (category) query.category = category;

    let sortOption = { date: -1 }; // Default: newest first
    if (sort === 'date_desc') sortOption = { date: -1 };

    const expenses = await Expense.find(query).sort(sortOption);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /expenses - Create new expense (Idempotent)
router.post('/', async (req, res) => {
  const { amount, category, description, date, idempotencyKey } = req.body;

  if (!idempotencyKey) return res.status(400).json({ message: 'Idempotency key required' });

  try {
    // Check if this request was already processed
    const existing = await Expense.findOne({ idempotencyKey });
    if (existing) return res.status(201).json(existing); // Return existing record if retry

    const newExpense = new Expense({
      amount: parseFloat(amount),
      category,
      description,
      date: new Date(date),
      idempotencyKey
    });

    await newExpense.save();
    res.status(201).json(newExpense);
  } catch (err) {
    if (err.code === 11000) { // Duplicate key error
        const existing = await Expense.findOne({ idempotencyKey });
        return res.status(201).json(existing);
    }
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;