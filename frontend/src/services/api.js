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

export default api;
