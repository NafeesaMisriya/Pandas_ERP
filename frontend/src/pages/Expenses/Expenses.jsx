import React, { useState, useEffect, useCallback } from 'react';
import { expensesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  Plus, Search, Filter, X, Edit2, Trash2, ChevronLeft, ChevronRight,
  DollarSign, Calendar, CreditCard, FileText, RotateCcw
} from 'lucide-react';

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];

export const Expenses = () => {
  const toast = useToast();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [form, setForm] = useState({
    title: '', category_id: '', amount: '', expense_date: '',
    payment_method: 'Cash', description: ''
  });
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);

  // New category
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const fetchCategories = useCallback(async () => {
    try {
      const res = await expensesApi.getCategories();
      setCategories(res.data);
    } catch { /* ignore */ }
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (search) params.search = search;
      if (filterCategory) params.category_id = filterCategory;
      if (filterMethod) params.payment_method = filterMethod;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await expensesApi.list(params);
      setExpenses(res.data.expenses || []);
      setTotal(res.data.total || 0);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filterCategory, filterMethod, startDate, endDate]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);
  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const totalPages = Math.ceil(total / pageSize);

  const resetFilters = () => {
    setSearch(''); setFilterCategory(''); setFilterMethod('');
    setStartDate(''); setEndDate(''); setPage(1);
  };

  const hasActiveFilters = search || filterCategory || filterMethod || startDate || endDate;

  const openAdd = () => {
    setEditingExpense(null);
    setForm({
      title: '', category_id: '', amount: '',
      expense_date: new Date().toISOString().split('T')[0],
      payment_method: 'Cash', description: ''
    });
    setShowModal(true);
  };

  const openEdit = (exp) => {
    setEditingExpense(exp);
    setForm({
      title: exp.title,
      category_id: exp.category_id || '',
      amount: String(exp.amount),
      expense_date: exp.expense_date || '',
      payment_method: exp.payment_method || 'Cash',
      description: exp.description || ''
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount || !form.expense_date) {
      toast.error('Title, amount and date are required');
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      if (form.category_id) fd.append('category_id', form.category_id);
      fd.append('amount', form.amount);
      fd.append('expense_date', form.expense_date);
      fd.append('payment_method', form.payment_method);
      fd.append('description', form.description);

      if (editingExpense) {
        await expensesApi.update(editingExpense.id, fd);
        toast.success('Expense updated');
      } else {
        await expensesApi.create(fd);
        toast.success('Expense recorded');
      }
      setShowModal(false);
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await expensesApi.delete(deleteId);
      toast.success('Expense deleted');
      setDeleteId(null);
      fetchExpenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      await expensesApi.addCategory({ name: newCatName.trim() });
      toast.success('Category added');
      setNewCatName('');
      setShowCatModal(false);
      fetchCategories();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add category');
    }
  };

  const totalExpenseAmount = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Expense Management</h2>
          <p className="text-sm text-gray-500 mt-1">Track and manage operating expenses</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCatModal(true)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5">
            <Filter className="w-4 h-4" /> Manage Categories
          </button>
          <button onClick={openAdd}
            className="px-4 py-2 text-sm bg-[#111] text-white rounded-lg hover:bg-[#333] transition flex items-center gap-1.5 font-semibold">
            <Plus className="w-4 h-4" /> Add Expense
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-red-50"><DollarSign className="w-5 h-5 text-red-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Page Total</p>
            <p className="text-lg font-bold text-gray-900">₹{totalExpenseAmount.toFixed(2)}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50"><FileText className="w-5 h-5 text-blue-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Total Records</p>
            <p className="text-lg font-bold text-gray-900">{total}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-amber-50"><Calendar className="w-5 h-5 text-amber-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Categories</p>
            <p className="text-lg font-bold text-gray-900">{categories.length}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search expenses..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#F5B900]/30 focus:border-[#F5B900]" />
          </div>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
            className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterMethod} onChange={e => { setFilterMethod(e.target.value); setPage(1); }}
            className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30">
            <option value="">All Methods</option>
            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
            className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30" placeholder="From" />
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
            className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30" placeholder="To" />
        </div>
        {hasActiveFilters && (
          <button onClick={resetFilters}
            className="mt-3 px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#111] text-white text-left">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold text-right">Amount</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">No expenses found</td></tr>
              ) : expenses.map((exp, i) => (
                <tr key={exp.id} className={`border-t hover:bg-gray-50 transition ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3 whitespace-nowrap">{exp.expense_date}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{exp.title}</div>
                    {exp.description && <div className="text-xs text-gray-400 truncate max-w-[200px]">{exp.description}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">{exp.category || 'Uncategorized'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">₹{exp.amount.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-xs text-gray-600">
                      <CreditCard className="w-3 h-3" />{exp.payment_method || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openEdit(exp)} title="Edit"
                        className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteId(exp.id)} title="Delete"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/50">
            <span className="text-xs text-gray-500">
              Showing {(page-1)*pageSize+1}–{Math.min(page*pageSize, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="p-1.5 rounded-lg border disabled:opacity-30 hover:bg-gray-100 transition">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border disabled:opacity-30 hover:bg-gray-100 transition">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">{editingExpense ? 'Edit Expense' : 'Add Expense'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input type="text" value={form.title} onChange={e => setForm({...form, title: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30">
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                  <input type="number" step="0.01" min="0" value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30">
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  rows={3} className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition">Cancel</button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 text-sm bg-[#111] text-white rounded-lg hover:bg-[#333] transition font-semibold disabled:opacity-50">
                  {saving ? 'Saving...' : (editingExpense ? 'Update' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-50 flex items-center justify-center">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold mb-2">Delete Expense?</h3>
            <p className="text-sm text-gray-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleDelete}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Categories Modal */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-bold">Expense Categories</h3>
              <button onClick={() => setShowCatModal(false)} className="p-1 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-3 max-h-[50vh] overflow-y-auto">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm">
                  <span>{c.name}</span>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <input type="text" placeholder="New category name" value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30"
                  onKeyDown={e => e.key === 'Enter' && addCategory()} />
                <button onClick={addCategory}
                  className="px-3 py-2 text-sm bg-[#111] text-white rounded-lg hover:bg-[#333] transition font-semibold">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;

