const Expense = require('../models/Expense');

// @desc    Get all expenses (with filter and sort)
// @route   GET /api/expenses
exports.getExpenses = async (req, res) => {
  try {
    const { category, sort } = req.query;
    const query = { user: req.user._id };

    if (category) {
      query.category = category;
    }

    // Default sort: newest first (date_desc)
    let sortOption = { date: -1 };
    if (sort === 'date_asc') {
      sortOption = { date: 1 };
    }

    const expenses = await Expense.find(query).sort(sortOption);
    const totalAmount = expenses.reduce((acc, curr) => acc + curr.amount, 0);

    res.status(200).json({
      success: true,
      total: totalAmount,
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
    const parsedAmount = Number(amount);
    const parsedDate = new Date(date);
    const cleanCategory = String(category || '').trim();
    const cleanDescription = String(description || '').trim();
    const cleanIdempotencyKey = String(idempotencyKey || '').trim();

    if (!cleanIdempotencyKey) {
      return res.status(400).json({ success: false, error: 'Idempotency key is required' });
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Amount must be a positive number' });
    }

    if (!cleanCategory) {
      return res.status(400).json({ success: false, error: 'Category is required' });
    }

    if (!cleanDescription) {
      return res.status(400).json({ success: false, error: 'Description is required' });
    }

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ success: false, error: 'A valid date is required' });
    }

    // Return existing row if this idempotency key was already used by this user.
    const existingExpense = await Expense.findOne({
      user: req.user._id,
      idempotencyKey: cleanIdempotencyKey,
    });
    if (existingExpense) {
      return res.status(200).json({
        success: true,
        data: existingExpense,
        info: 'Retrieved existing entry (Idempotent)',
      });
    }

    const expense = await Expense.create({
      user: req.user._id,
      amount: Number(parsedAmount.toFixed(2)),
      category: cleanCategory,
      description: cleanDescription,
      date: parsedDate,
      idempotencyKey: cleanIdempotencyKey,
    });

    res.status(201).json({ success: true, data: expense });
  } catch (error) {
    // Duplicate key can still happen under concurrent retries.
    if (error.code === 11000) {
      const existingExpense = await Expense.findOne({
        user: req.user._id,
        idempotencyKey: String(req.body.idempotencyKey || '').trim(),
      });
      if (existingExpense) {
        return res.status(200).json({
          success: true,
          data: existingExpense,
          info: 'Retrieved existing entry (Idempotent)',
        });
      }
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ success: false, error: messages });
    }

    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Delete an expense by id
// @route   DELETE /api/expenses/:id
exports.deleteExpense = async (req, res) => {
  try {
    const deletedExpense = await Expense.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!deletedExpense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    return res.status(200).json({ success: true, data: deletedExpense });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }

    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};
