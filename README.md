# 🌿 Expense Tracker Application
Expense Tracker is a production-minded, full-stack expense tracking application built to help users record and review personal expenses with clarity and reliability. Designed for real-world conditions (network retries, refreshes, duplicate submissions), it ensures accurate data handling while keeping the feature set intentionally focused and maintainable.
## 🚀 Features
- User authentication and authorization
- Expense tracking with categories
- Sorting and filtering of expenses
- Responsive frontend design
- RESTful API for backend services
## 🛠️ Technologies Used
- Node.js
- Express.js
- React.js
- MongoDB
- Mongoose
- JSON Web Tokens (JWT)
- dotenv
- cors
- axios
## 🛠️ Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/expense-tracker.git
   ```
2. Navigate to the project directory:
   ```bash
   cd expense-tracker
   ```
3. Install dependencies for both backend and frontend:
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```
4. Set up environment variables:
   - Create a `.env` file in the backend directory.
   - Add the following environment variables:
     ```
     PORT=3000
     MONGODB_URI=your_mongodb_connection_string
     JWT_SECRET=your_jwt_secret
     ```
5. Run the application:
   ```bash
   # Start the backend server
   cd backend
   npm start

   # Start the frontend development server
   cd ../frontend
   npm start
   ```
