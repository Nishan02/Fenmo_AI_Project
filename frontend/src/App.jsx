import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const AUTH_STORAGE_KEY = 'expense_tracker_auth';
const PENDING_EXPENSE_KEY = 'expense_tracker_pending_expense';

const getTodayDateString = () => {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
};

const getErrorMessage = (error, fallbackMessage) => {
  if (error?.code === 'ERR_NETWORK') {
    return 'Cannot reach API server. Start backend on http://localhost:5000.';
  }

  const apiError = error?.response?.data?.error;

  if (Array.isArray(apiError)) {
    return apiError.join(', ');
  }

  if (typeof apiError === 'string') {
    return apiError;
  }

  if (typeof error?.response?.data?.message === 'string') {
    return error.response.data.message;
  }

  if (typeof error?.message === 'string') {
    return error.message;
  }

  return fallbackMessage;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestWithRetry = async (requestFn, retries = 1, delayMs = 600) => {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const retryable = !status || status >= 500;

      if (!retryable || attempt === retries) {
        break;
      }

      await wait(delayMs * (attempt + 1));
    }
  }

  throw lastError;
};

const readStoredAuth = () => {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

const createIdempotencyKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const formatCurrency = (amount) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
};

const formatDate = (dateValue) => {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [user, setUser] = useState(readStoredAuth);

  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category: '',
    description: '',
    date: getTodayDateString(),
  });

  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('date_desc');

  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitInfo, setSubmitInfo] = useState('');

  const [pendingExpense, setPendingExpense] = useState(null);
  const [replayAttempted, setReplayAttempted] = useState(false);

  const accountKey = user?._id || user?.email || null;

  const authHeaders = useMemo(() => {
    if (!user?.token) {
      return {};
    }

    return {
      Authorization: `Bearer ${user.token}`,
    };
  }, [user?.token]);

  const clearPendingExpense = useCallback(() => {
    localStorage.removeItem(PENDING_EXPENSE_KEY);
    setPendingExpense(null);
  }, []);

  const savePendingExpense = useCallback(
    (payload) => {
      if (!accountKey) {
        return;
      }

      const record = { ...payload, userKey: accountKey };
      localStorage.setItem(PENDING_EXPENSE_KEY, JSON.stringify(record));
      setPendingExpense(record);
    },
    [accountKey],
  );

  const fetchExpenses = useCallback(async () => {
    if (!user?.token) {
      return;
    }

    setExpensesLoading(true);
    setExpensesError('');

    try {
      const response = await requestWithRetry(
        () =>
          axios.get(`${API_BASE_URL}/expenses`, {
            headers: authHeaders,
            params: { sort: 'date_desc' },
            timeout: 10000,
          }),
        1,
      );

      const rows = Array.isArray(response?.data?.data) ? response.data.data : [];
      setExpenses(rows);
    } catch (error) {
      setExpensesError(getErrorMessage(error, 'Unable to load expenses.'));
    } finally {
      setExpensesLoading(false);
    }
  }, [authHeaders, user?.token]);

  const submitExpense = useCallback(
    async (payload, { isReplay = false } = {}) => {
      if (!user?.token) {
        return;
      }

      if (!isReplay) {
        savePendingExpense(payload);
      }

      setExpenseSubmitting(true);
      setSubmitError('');
      setSubmitInfo(isReplay ? 'Resuming pending expense submission...' : 'Saving expense...');

      try {
        const response = await requestWithRetry(
          () =>
            axios.post(`${API_BASE_URL}/expenses`, payload, {
              headers: authHeaders,
              timeout: 10000,
            }),
          1,
        );

        clearPendingExpense();
        setExpenseForm({ amount: '', category: '', description: '', date: getTodayDateString() });
        setSubmitInfo(response?.data?.info || 'Expense saved successfully.');
        await fetchExpenses();
      } catch (error) {
        setSubmitError(
          getErrorMessage(
            error,
            'Expense save failed. You can retry safely because this submission is idempotent.',
          ),
        );
        setSubmitInfo('');
      } finally {
        setExpenseSubmitting(false);
      }
    },
    [authHeaders, clearPendingExpense, fetchExpenses, savePendingExpense, user?.token],
  );

  useEffect(() => {
    if (!user?.token) {
      setExpenses([]);
      return;
    }

    fetchExpenses();
  }, [fetchExpenses, user?.token]);

  useEffect(() => {
    setReplayAttempted(false);

    if (!accountKey) {
      setPendingExpense(null);
      return;
    }

    const rawPending = localStorage.getItem(PENDING_EXPENSE_KEY);

    if (!rawPending) {
      setPendingExpense(null);
      return;
    }

    try {
      const parsed = JSON.parse(rawPending);

      if (parsed.userKey && parsed.userKey !== accountKey) {
        setPendingExpense(null);
        return;
      }

      setPendingExpense(parsed);
    } catch {
      localStorage.removeItem(PENDING_EXPENSE_KEY);
      setPendingExpense(null);
    }
  }, [accountKey]);

  useEffect(() => {
    if (!user?.token || !pendingExpense || replayAttempted) {
      return;
    }

    setReplayAttempted(true);
    submitExpense(pendingExpense, { isReplay: true });
  }, [pendingExpense, replayAttempted, submitExpense, user?.token]);

  const categories = useMemo(() => {
    const unique = new Set();

    expenses.forEach((expense) => {
      if (expense?.category) {
        unique.add(expense.category);
      }
    });

    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [expenses]);

  const visibleExpenses = useMemo(() => {
    const filtered = expenses.filter((expense) => {
      if (categoryFilter === 'all') {
        return true;
      }

      return expense.category === categoryFilter;
    });

    filtered.sort((left, right) => {
      const leftDate = new Date(left.date).getTime();
      const rightDate = new Date(right.date).getTime();

      if (sortOrder === 'date_asc') {
        return leftDate - rightDate;
      }

      return rightDate - leftDate;
    });

    return filtered;
  }, [categoryFilter, expenses, sortOrder]);

  const visibleTotal = useMemo(() => {
    return visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }, [visibleExpenses]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();

    setAuthLoading(true);
    setAuthError('');

    const payload = {
      email: authForm.email.trim(),
      password: authForm.password,
    };

    if (authMode === 'signup') {
      payload.name = authForm.name.trim();
    }

    try {
      const endpoint = authMode === 'signup' ? 'register' : 'login';

      const response = await requestWithRetry(
        () =>
          axios.post(`${API_BASE_URL}/auth/${endpoint}`, payload, {
            timeout: 10000,
          }),
        1,
      );

      setUser(response.data);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(response.data));
      setAuthForm({ name: '', email: '', password: '' });
    } catch (error) {
      setAuthError(getErrorMessage(error, 'Authentication failed.'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setExpenses([]);
    setAuthForm({ name: '', email: '', password: '' });
    setSubmitError('');
    setSubmitInfo('');
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();

    setSubmitError('');
    setSubmitInfo('');

    const amount = Number(expenseForm.amount);
    const category = expenseForm.category.trim();
    const description = expenseForm.description.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      setSubmitError('Amount must be greater than zero.');
      return;
    }

    if (!category) {
      setSubmitError('Category is required.');
      return;
    }

    if (!description) {
      setSubmitError('Description is required.');
      return;
    }

    if (!expenseForm.date) {
      setSubmitError('Date is required.');
      return;
    }

    await submitExpense({
      amount,
      category,
      description,
      date: expenseForm.date,
      idempotencyKey: createIdempotencyKey(),
    });
  };

  return (
    <div className="page-shell">
      <div className="background-glow background-glow-left" aria-hidden="true" />
      <div className="background-glow background-glow-right" aria-hidden="true" />

      <main className="app-container">
        <header className="app-header">
          <div>
            <p className="eyebrow">Personal Finance Tool</p>
            <h1>Expense Tracker</h1>
          </div>

          {user ? (
            <div className="user-actions">
              <span className="welcome-label">{user.name}</span>
              <button type="button" className="button secondary" onClick={handleLogout}>
                Logout
              </button>
            </div>
          ) : null}
        </header>

        {!user ? (
          <section className="panel auth-panel">
            <div className="tabs" role="tablist" aria-label="Authentication">
              <button
                type="button"
                className={`tab ${authMode === 'login' ? 'active' : ''}`}
                onClick={() => setAuthMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={`tab ${authMode === 'signup' ? 'active' : ''}`}
                onClick={() => setAuthMode('signup')}
              >
                Sign up
              </button>
            </div>

            <form className="form-stack" onSubmit={handleAuthSubmit}>
              {authMode === 'signup' ? (
                <label className="field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={authForm.name}
                    onChange={(event) =>
                      setAuthForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                    autoComplete="name"
                  />
                </label>
              ) : null}

              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, email: event.target.value }))
                  }
                  required
                  autoComplete="email"
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, password: event.target.value }))
                  }
                  required
                  minLength={6}
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                />
              </label>

              {authError ? <p className="feedback error">{authError}</p> : null}

              <button type="submit" className="button primary" disabled={authLoading}>
                {authLoading ? 'Please wait...' : authMode === 'signup' ? 'Create account' : 'Login'}
              </button>
            </form>
          </section>
        ) : (
          <div className="dashboard-grid">
            <section className="panel">
              <h2>Add Expense</h2>

              <form className="form-stack" onSubmit={handleExpenseSubmit}>
                <label className="field">
                  <span>Amount</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(event) =>
                      setExpenseForm((current) => ({ ...current, amount: event.target.value }))
                    }
                    placeholder="e.g. 1499.50"
                    required
                  />
                </label>

                <label className="field">
                  <span>Category</span>
                  <input
                    type="text"
                    value={expenseForm.category}
                    onChange={(event) =>
                      setExpenseForm((current) => ({ ...current, category: event.target.value }))
                    }
                    placeholder="e.g. Groceries"
                    required
                  />
                </label>

                <label className="field">
                  <span>Description</span>
                  <input
                    type="text"
                    value={expenseForm.description}
                    onChange={(event) =>
                      setExpenseForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="What was this expense for?"
                    required
                  />
                </label>

                <label className="field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={expenseForm.date}
                    onChange={(event) =>
                      setExpenseForm((current) => ({ ...current, date: event.target.value }))
                    }
                    required
                  />
                </label>

                {submitError ? <p className="feedback error">{submitError}</p> : null}
                {submitInfo ? <p className="feedback info">{submitInfo}</p> : null}

                <button type="submit" className="button primary" disabled={expenseSubmitting}>
                  {expenseSubmitting ? 'Saving...' : 'Save Expense'}
                </button>
              </form>

              {pendingExpense ? (
                <div className="pending-box">
                  <p>A previous submission is pending confirmation.</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => submitExpense(pendingExpense, { isReplay: true })}
                    disabled={expenseSubmitting}
                  >
                    Retry pending save
                  </button>
                </div>
              ) : null}
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Expenses</h2>

                <div className="controls">
                  <label className="field compact">
                    <span>Category</span>
                    <select
                      value={categoryFilter}
                      onChange={(event) => setCategoryFilter(event.target.value)}
                    >
                      <option value="all">All</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field compact">
                    <span>Sort</span>
                    <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                      <option value="date_desc">Newest first</option>
                      <option value="date_asc">Oldest first</option>
                    </select>
                  </label>
                </div>
              </div>

              {expensesError ? <p className="feedback error">{expensesError}</p> : null}

              <p className="total-line">Total: {formatCurrency(visibleTotal)}</p>

              {expensesLoading ? (
                <p className="muted">Loading expenses...</p>
              ) : visibleExpenses.length === 0 ? (
                <p className="muted">No expenses found for the selected filters.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th className="amount">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleExpenses.map((expense) => (
                        <tr key={expense._id || expense.id || expense.idempotencyKey}>
                          <td>{formatDate(expense.date)}</td>
                          <td>{expense.category}</td>
                          <td>{expense.description}</td>
                          <td className="amount">{formatCurrency(Number(expense.amount || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
