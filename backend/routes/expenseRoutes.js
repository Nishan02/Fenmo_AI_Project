const express = require('express');
const router = express.Router();
const { getExpenses, createExpense } = require('../controllers/expenseController');
const { protect } = require('../middleware/authMiddleware');

// All expense routes now require a valid token
router.route('/')
  .get(protect, getExpenses)
  .post(protect, createExpense);

module.exports = router;