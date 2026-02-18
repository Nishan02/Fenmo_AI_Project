const test = require('node:test');
const assert = require('node:assert/strict');
const Expense = require('../models/Expense');
const { createExpense, getExpenses, deleteExpense } = require('../controllers/expenseController');

const originalMethods = {
  find: Expense.find,
  findOne: Expense.findOne,
  create: Expense.create,
  findOneAndDelete: Expense.findOneAndDelete,
};

const createMockResponse = () => {
  const res = {
    statusCode: 200,
    payload: null,
  };

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data) => {
    res.payload = data;
    return res;
  };

  return res;
};

test.afterEach(() => {
  Expense.find = originalMethods.find;
  Expense.findOne = originalMethods.findOne;
  Expense.create = originalMethods.create;
  Expense.findOneAndDelete = originalMethods.findOneAndDelete;
});

test('createExpense rejects non-positive amount', async () => {
  const req = {
    user: { _id: 'user-1' },
    body: {
      amount: -5,
      category: 'Food',
      description: 'Lunch',
      date: '2026-02-18',
      idempotencyKey: 'key-1',
    },
  };
  const res = createMockResponse();

  await createExpense(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.success, false);
  assert.match(res.payload.error, /Amount must be a positive number/);
});

test('createExpense returns existing expense for same idempotency key', async () => {
  const existing = {
    _id: 'exp-1',
    amount: 200,
    category: 'Food',
    description: 'Dinner',
    date: new Date('2026-02-18'),
    idempotencyKey: 'dup-key',
  };

  Expense.findOne = async (query) => {
    assert.deepEqual(query, { user: 'user-1', idempotencyKey: 'dup-key' });
    return existing;
  };
  Expense.create = async () => {
    throw new Error('create should not be called when idempotency key already exists');
  };

  const req = {
    user: { _id: 'user-1' },
    body: {
      amount: 200,
      category: 'Food',
      description: 'Dinner',
      date: '2026-02-18',
      idempotencyKey: 'dup-key',
    },
  };
  const res = createMockResponse();

  await createExpense(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.data, existing);
  assert.match(res.payload.info, /Idempotent/);
});

test('getExpenses applies category filter, sort, and returns total', async () => {
  let capturedQuery = null;
  let capturedSort = null;

  Expense.find = (query) => {
    capturedQuery = query;
    return {
      sort: async (sortOption) => {
        capturedSort = sortOption;
        return [
          { amount: 99.5, category: 'Food' },
          { amount: 100, category: 'Food' },
        ];
      },
    };
  };

  const req = {
    user: { _id: 'user-1' },
    query: { category: 'Food', sort: 'date_desc' },
  };
  const res = createMockResponse();

  await getExpenses(req, res);

  assert.deepEqual(capturedQuery, { user: 'user-1', category: 'Food' });
  assert.deepEqual(capturedSort, { date: -1 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.count, 2);
  assert.equal(res.payload.total, 199.5);
});

test('getExpenses supports ascending date sort when sort=date_asc', async () => {
  let capturedSort = null;

  Expense.find = () => ({
    sort: async (sortOption) => {
      capturedSort = sortOption;
      return [];
    },
  });

  const req = {
    user: { _id: 'user-1' },
    query: { sort: 'date_asc' },
  };
  const res = createMockResponse();

  await getExpenses(req, res);

  assert.deepEqual(capturedSort, { date: 1 });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.total, 0);
});

test('deleteExpense removes expense when id belongs to user', async () => {
  const deleted = { _id: 'exp-1', user: 'user-1', amount: 50 };

  Expense.findOneAndDelete = async (query) => {
    assert.deepEqual(query, { _id: 'exp-1', user: 'user-1' });
    return deleted;
  };

  const req = {
    user: { _id: 'user-1' },
    params: { id: 'exp-1' },
  };
  const res = createMockResponse();

  await deleteExpense(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.data, deleted);
});

test('deleteExpense returns 404 when expense is not found', async () => {
  Expense.findOneAndDelete = async () => null;

  const req = {
    user: { _id: 'user-1' },
    params: { id: 'missing-expense' },
  };
  const res = createMockResponse();

  await deleteExpense(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.success, false);
  assert.match(res.payload.error, /Expense not found/);
});
