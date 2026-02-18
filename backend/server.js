// backend/server.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');

// 1. Load env vars FIRST before anything else
dotenv.config();

// 2. Connect to database
connectDB();

const app = express();

// 3. Middleware
app.use(cors());
app.use(express.json());

// 4. Mount routers (Cleaned up duplicates)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/expenses', require('./routes/expenseRoutes'));

// 5. Error Handler (Must be the last middleware)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});