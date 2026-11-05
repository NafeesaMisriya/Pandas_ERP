import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

export const productsApi = {
  list: (params) => api.get('/products', { params }),
  get: (code) => api.get(`/products/${code}`),
  getCategories: () => api.get('/products/categories'),
  getNextCode: (category) => api.get('/products/next-code', { params: { category } }),
  create: (formData) => api.post('/products', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (code, formData) => api.put(`/products/${code}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  quickUpdate: (code, data) => api.patch(`/products/${code}/quick-update`, data),
  delete: (code) => api.delete(`/products/${code}`),
  importCsv: () => api.post('/products/import-csv'),
};

export const billingApi = {
  getState: () => api.get('/billing/state'),
  getProducts: (category) => api.get('/billing/products', { params: { category } }),
  addToCart: (item_code, quantity) => api.post('/billing/cart/add', { item_code, quantity }),
  updateQty: (index, quantity) => api.post('/billing/cart/update-qty', { index, quantity }),
  updatePrice: (index, price) => api.post('/billing/cart/update-price', { index, price }),
  removeItem: (index) => api.delete(`/billing/cart/remove/${index}`),
  clearCart: () => api.post('/billing/cart/clear'),
  setCustomer: (customer) => api.post('/billing/customer', customer),
  holdBill: () => api.post('/billing/hold'),
  resumeBill: (holdId) => api.post(`/billing/resume/${holdId}`),
  checkout: (data) => api.post('/billing/checkout', data),
};

export const billsApi = {
  list: (search) => api.get('/bills', { params: { search } }),
  get: (invoiceNo) => api.get(`/bills/${invoiceNo}`),
  cancel: (invoiceNo) => api.post(`/bills/${invoiceNo}/cancel`),
};

export const purchasesApi = {
  getCategories: () => api.get('/purchases/categories'),
  getItems: (category) => api.get(`/purchases/items/${category}`),
  save: (data) => api.post('/purchases', data),
  getHistory: (params) => api.get('/purchases/history', { params }),
  receive: (id) => api.post(`/purchases/${id}/receive`),
  verify: (id) => api.post(`/purchases/${id}/verify`),
};

export const reportsApi = {
  get: (params) => api.get('/reports', { params }),
};

export const zReportApi = {
  get: (date) => api.get('/z-report', { params: { date } }),
  generate: (report_date) => api.post('/z-report/generate', { report_date }),
};

export const customersApi = {
  list: (params) => api.get('/customers', { params }),
  search: (q) => api.get('/customers/search', { params: { q } }),
  get: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
};

export const suppliersApi = {
  list: (params) => api.get('/suppliers', { params }),
  search: (q) => api.get('/suppliers/search', { params: { q } }),
  get: (id) => api.get(`/suppliers/${id}`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
};

export const inventoryApi = {
  getStatus: () => api.get('/inventory/status'),
  getAlerts: (params) => api.get('/inventory/alerts', { params }),
  getReorderSuggestions: (params) => api.get('/inventory/reorder-suggestions', { params }),
  getMovements: (params) => api.get('/inventory/movements', { params }),
  adjust: (data) => api.post('/inventory/adjust', data),
};

export const expensesApi = {
  getCategories: () => api.get('/expenses/categories'),
  addCategory: (data) => api.post('/expenses/categories', data),
  list: (params) => api.get('/expenses', { params }),
  get: (id) => api.get(`/expenses/${id}`),
  create: (data) => api.post('/expenses', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id, data) => api.put(`/expenses/${id}`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/expenses/${id}`),
  report: (params) => api.get('/expenses/report', { params }),
};

export const profitApi = {
  summary: (params) => api.get('/profit/summary', { params }),
  report: (params) => api.get('/profit/report', { params }),
};

export const payablesApi = {
  getSummary: () => api.get('/payables/summary'),
  getSuppliers: (params) => api.get('/payables/suppliers', { params }),
  getPurchases: (params) => api.get('/payables/purchases', { params }),
  getPurchaseDetail: (id) => api.get(`/payables/purchases/${id}`),
  recordPayment: (data) => api.post('/payables/payments', data),
  updateDueDate: (id, data) => api.post(`/payables/purchases/${id}/due-date`, data),
};

export const authApi = {
  getStatus: () => api.get('/auth/status'),
  unlockAdmin: (password) => api.post('/auth/unlock-admin', { password }),
  lockAdmin: () => api.post('/auth/lock-admin'),
};

export default api;
