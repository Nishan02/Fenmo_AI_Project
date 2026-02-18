const Expense = require('../models/Expense');

// @desc    Get all expenses (with filter and sort)
// @route   GET /api/expenses
exports.getExpenses = async (req, res) => {
  try {
    const { category, sort } = req.query;
    let query = {};

    if (category) {
      query.category = category;
    }

    // Default sort: newest first (date_desc)
    let sortOption = { date: -1 };
    
    //const expenses = await Expense.find(query).sort(sortOption);
    const expenses = await Expense.find({ user: req.user._id }).sort(sortOption); // Filter by user

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Create an expense (Idempotent)
// @route   POST /api/expenses
exports.createExpense = async (req, res) => {
  try {
    const { amount, category, description, date, idempotencyKey } = req.body;

    // 1. Check if idempotencyKey exists
    if (!idempotencyKey) {
      return res.status(400).json({ success: false, error: 'Idempotency Key missing' });
    }

    // 2. Try to create the record
    const expense = await Expense.create({
      user: req.user._id,
      amount,
      category,
      description,
      date,
      idempotencyKey
    });

    res.status(201).json({ success: true, data: expense });

  } catch (error) {
    // 3. Handle Duplicate Key Error (The Retry Case)
    if (error.code === 11000) {
      const existingExpense = await Expense.findOne({ idempotencyKey: req.body.idempotencyKey });
      return res.status(200).json({ 
        success: true, 
        data: existingExpense, 
        info: 'Retrieved existing entry (Idempotent)' 
      });
    }

    // 4. Handle Validation Errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, error: messages });
    }

    res.status(500).json({ success: false, error: 'Server Error' });
  }
};