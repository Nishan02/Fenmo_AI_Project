import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
const AUTH_STORAGE_KEY = 'expense_tracker_auth';
const PENDING_EXPENSE_KEY = 'expense_tracker_pending_expense';
const DEFAULT_EXPENSE_CATEGORIES = [
  'Food',
  'Transport',
  'Rent',
  'Utilities',
  'Entertainment',
  'Shopping',
  'Health',
  'Education',
  'Other',
];

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
    category: DEFAULT_EXPENSE_CATEGORIES[0],
    description: '',
    date: getTodayDateString(),
  });
  const [categoryInputType, setCategoryInputType] = useState('preset');
  const [customCategory, setCustomCategory] = useState('');

  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expensesError, setExpensesError] = useState('');

  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('date_desc');

  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState('');
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
        setExpenseForm({
          amount: '',
          category: DEFAULT_EXPENSE_CATEGORIES[0],
          description: '',
          date: getTodayDateString(),
        });
        setCategoryInputType('preset');
        setCustomCategory('');
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

  const formCategoryOptions = useMemo(() => {
    const merged = new Set(DEFAULT_EXPENSE_CATEGORIES);

    categories.forEach((category) => {
      if (category) {
        merged.add(category);
      }
    });

    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [categories]);

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
  const isListCustomized = categoryFilter !== 'all' || sortOrder !== 'date_desc';

  const summaryByCategory = useMemo(() => {
    const totals = new Map();

    visibleExpenses.forEach((expense) => {
      const key = expense.category || 'Uncategorized';
      const value = Number(expense.amount || 0);
      totals.set(key, (totals.get(key) || 0) + value);
    });

    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
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
    setExpenseForm({
      amount: '',
      category: DEFAULT_EXPENSE_CATEGORIES[0],
      description: '',
      date: getTodayDateString(),
    });
    setCategoryInputType('preset');
    setCustomCategory('');
    setSubmitError('');
    setSubmitInfo('');
    localStorage.removeItem(AUTH_STORAGE_KEY);
  };

  const handleExpenseSubmit = async (event) => {
    event.preventDefault();

    setSubmitError('');
    setSubmitInfo('');

    const amount = Number(expenseForm.amount);
    const category =
      categoryInputType === 'custom' ? customCategory.trim() : expenseForm.category.trim();
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

  const handleDeleteExpense = useCallback(
    async (expenseId) => {
      if (!expenseId || !user?.token) {
        return;
      }

      const shouldDelete = window.confirm('Delete this expense?');
      if (!shouldDelete) {
        return;
      }

      setDeletingExpenseId(expenseId);
      setExpensesError('');
      setSubmitInfo('');

      try {
        const response = await requestWithRetry(
          () =>
            axios.delete(`${API_BASE_URL}/expenses/${expenseId}`, {
              headers: authHeaders,
              timeout: 10000,
            }),
          1,
        );

        if (response?.status !== 200 || response?.data?.success !== true) {
          throw new Error('Delete was not confirmed by server.');
        }

        setExpenses((current) =>
          current.filter((expense) => (expense._id || expense.id) !== expenseId),
        );
        setSubmitInfo('Expense deleted successfully.');
        await fetchExpenses();
      } catch (error) {
        if (error?.response?.status === 404) {
          setExpensesError(
            'Delete failed (404). Expense was not found on server. Refreshing list.',
          );
          await fetchExpenses();
          return;
        }
        setExpensesError(getErrorMessage(error, 'Unable to delete expense.'));
      } finally {
        setDeletingExpenseId('');
      }
    },
    [authHeaders, fetchExpenses, user?.token],
  );

  useEffect(() => {
    if (!submitInfo) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setSubmitInfo('');
    }, 3200);

    return () => clearTimeout(timer);
  }, [submitInfo]);

  return (
    <div className={`page-shell ${!user ? 'guest-mode' : ''}`}>
      <div className="background-glow background-glow-left" aria-hidden="true" />
      <div className="background-glow background-glow-right" aria-hidden="true" />

      <main className={`app-container ${!user ? 'auth-layout' : ''}`}>
        {user ? (
          <header className="app-header">
            <div>
              <p className="eyebrow">Personal Finance Tool</p>
              <h1>Expense Tracker</h1>
            </div>

            <div className="user-actions">
              <span className="welcome-label">{user.name}</span>
              <button type="button" className="button secondary" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </header>
        ) : null}

        {!user ? (
          <section className="panel auth-panel">
            <div className="auth-brand">
              <p className="eyebrow">Personal Finance Tool</p>
              <h1>Expense Tracker</h1>
              <p className="auth-subtitle">Log in or sign up to start tracking your spending.</p>
            </div>
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
                  <select
                    value={categoryInputType === 'custom' ? '__custom__' : expenseForm.category}
                    onChange={(event) => {
                      const selectedValue = event.target.value;
                      if (selectedValue === '__custom__') {
                        setCategoryInputType('custom');
                      } else {
                        setCategoryInputType('preset');
                        setExpenseForm((current) => ({ ...current, category: selectedValue }));
                      }
                    }}
                  >
                    {formCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                    <option value="__custom__">Custom category...</option>
                  </select>
                </label>
                {categoryInputType === 'custom' ? (
                  <label className="field">
                    <span>Custom category</span>
                    <input
                      type="text"
                      value={customCategory}
                      onChange={(event) => setCustomCategory(event.target.value)}
                      placeholder="Type your own category"
                      required
                    />
                  </label>
                ) : null}

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

                  {isListCustomized ? (
                    <button
                      type="button"
                      className="button ghost compact-action"
                      onClick={() => {
                        setCategoryFilter('all');
                        setSortOrder('date_desc');
                      }}
                    >
                      Reset
                    </button>
                  ) : null}
                </div>
              </div>

              {expensesError ? <p className="feedback error">{expensesError}</p> : null}

              <div className="total-card" aria-live="polite">
                <div>
                  <p className="total-label">Visible Total</p>
                  <p className="total-amount">{formatCurrency(visibleTotal)}</p>
                </div>
                <div className="total-meta">
                  <span className="meta-chip">{visibleExpenses.length} item(s)</span>
                  <span className="meta-chip">
                    {categoryFilter === 'all' ? 'All categories' : categoryFilter}
                  </span>
                </div>
              </div>
              {summaryByCategory.length > 0 ? (
                <div className="summary-box">
                  <p className="summary-title">Summary by category</p>
                  <div className="summary-items">
                    {summaryByCategory.map((entry) => (
                      <div className="summary-item" key={entry.category}>
                        <span>{entry.category}</span>
                        <strong>{formatCurrency(entry.total)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {expensesLoading ? (
                <div className="loading-state" aria-live="polite">
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                  <div className="skeleton-row" />
                </div>
              ) : visibleExpenses.length === 0 ? (
                <div className="empty-state">
                  <p className="muted">No expenses found for the selected filters.</p>
                  {isListCustomized ? (
                    <button
                      type="button"
                      className="button secondary compact-action"
                      onClick={() => {
                        setCategoryFilter('all');
                        setSortOrder('date_desc');
                      }}
                    >
                      Show all expenses
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th className="amount">Amount</th>
                        <th className="action-cell">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleExpenses.map((expense) => {
                        const expenseId = expense._id || expense.id;

                        return (
                          <tr key={expenseId || expense.idempotencyKey}>
                            <td>{formatDate(expense.date)}</td>
                            <td>{expense.category}</td>
                            <td>{expense.description}</td>
                            <td className="amount">{formatCurrency(Number(expense.amount || 0))}</td>
                            <td className="action-cell">
                              <button
                                type="button"
                                className="icon-button danger"
                                aria-label="Delete expense"
                                title="Delete expense"
                                onClick={() => handleDeleteExpense(expenseId)}
                                disabled={!expenseId || deletingExpenseId === expenseId}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 7h2v8h-2v-8zm4 0h2v8h-2v-8zM7 10h2v8H7v-8z" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
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
