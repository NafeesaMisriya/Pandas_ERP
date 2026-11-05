import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  Receipt,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  RotateCcw,
  UserCheck,
  TrendingUp,
  X
} from 'lucide-react';
import { customersApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export const Customers = () => {
  const toast = useToast();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form inputs
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    status: 'Active',
  });

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await customersApi.list(params);
      setCustomers(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  const handleOpenCreate = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      status: 'Active',
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      status: customer.status || 'Active',
    });
    setIsFormModalOpen(true);
  };

  const handleOpenDetail = async (customerId) => {
    try {
      setLoadingDetail(true);
      setIsDetailModalOpen(true);
      const res = await customersApi.get(customerId);
      setSelectedCustomer(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load customer profile');
      setIsDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    try {
      setSaving(true);
      if (editingCustomer) {
        await customersApi.update(editingCustomer.customer_id, formData);
        toast.success(`Customer ${editingCustomer.customer_id} updated successfully`);
      } else {
        const res = await customersApi.create(formData);
        toast.success(res.data?.message || 'Customer registered successfully');
      }
      setIsFormModalOpen(false);
      fetchCustomers();
      if (selectedCustomer && editingCustomer && selectedCustomer.customer_id === editingCustomer.customer_id) {
        handleOpenDetail(editingCustomer.customer_id);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  // Metrics calculation
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.status === 'Active').length;
  const totalRevenue = customers.reduce((sum, c) => sum + (c.total_purchase_value || 0), 0);
  const totalOrders = customers.reduce((sum, c) => sum + (c.transaction_count || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Directory</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Customer Management</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage customer profiles, purchase history, and sales accounts</p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-sm transition active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4 text-[#111111]" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Customers</span>
            <Users className="w-4 h-4 text-[#F5B900]" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalCustomers}</div>
          <span className="text-[11px] text-slate-400 font-medium">Registered in ERP</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Accounts</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{activeCustomers}</div>
          <span className="text-[11px] text-emerald-600 font-semibold">Ready for checkout</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Invoiced</span>
            <TrendingUp className="w-4 h-4 text-gold-500" />
          </div>
          <div className="text-2xl font-black text-[#F5B900]">
            ₹{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">{totalOrders} completed bills</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Avg Order / Cust</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            ₹{(totalOrders > 0 ? totalRevenue / totalOrders : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Across active accounts</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by customer name, phone, email, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          {(searchTerm || statusFilter) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('');
              }}
              className="px-3 py-2 text-rose-600 font-bold hover:bg-rose-50 rounded-xl transition flex items-center gap-1 border border-rose-200"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <Loading text="Loading customer records..." fullHeight />
        ) : customers.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-xs">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-700 text-sm">No customers found</p>
            <p className="text-slate-500 mt-1">
              {searchTerm || statusFilter
                ? 'Try adjusting your search criteria or filter.'
                : 'Click "New Customer" to register your first customer account.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Customer ID</th>
                  <th className="py-3.5 px-4">Customer Name</th>
                  <th className="py-3.5 px-4">Phone / Contact</th>
                  <th className="py-3.5 px-4">Orders</th>
                  <th className="py-3.5 px-4">Total Purchases</th>
                  <th className="py-3.5 px-4">Last Visit</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.customer_id} className="hover:bg-gold-50/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {c.customer_id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-xs">{c.name}</div>
                      {c.email && (
                        <div className="text-[11px] text-slate-400 font-normal">{c.email}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-semibold">
                      {c.phone ? (
                        <span className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {c.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {c.transaction_count} bill{c.transaction_count === 1 ? '' : 's'}
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900">
                      ₹{c.total_purchase_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {c.last_purchase_at ? (
                        new Date(c.last_purchase_at).toLocaleDateString()
                      ) : (
                        <span className="text-slate-400">Never</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={c.status === 'Active' ? 'success' : 'default'} size="sm">
                        {c.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetail(c.customer_id)}
                          className="p-1.5 text-slate-400 hover:text-navy-900 hover:bg-gold-50 rounded-lg transition"
                          title="View Profile & Invoices"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(c)}
                          className="p-1.5 text-slate-400 hover:text-[#F5B900] hover:bg-gold-50 rounded-lg transition"
                          title="Edit Customer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Form Modal (Add / Edit) */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingCustomer ? `Edit Customer (${editingCustomer.customer_id})` : 'Register New Customer'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Full Name *</label>
            <input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Mobile Phone</label>
              <input
                type="text"
                placeholder="10-digit mobile"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Email Address (Optional)</label>
            <input
              type="email"
              placeholder="customer@domain.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Billing / Delivery Address (Optional)</label>
            <textarea
              rows={2}
              placeholder="Street, City, Pincode"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs resize-none"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setIsFormModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] font-black rounded-xl text-xs shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingCustomer ? 'Update Customer' : 'Register Customer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail & Purchase Ledger Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedCustomer ? `Customer Account: ${selectedCustomer.name} (${selectedCustomer.customer_id})` : 'Customer Details'}
        maxWidth="max-w-3xl"
      >
        {loadingDetail ? (
          <Loading text="Loading account details..." />
        ) : selectedCustomer ? (
          <div className="space-y-5 text-xs">
            {/* Profile Overview Card */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Contact Information</span>
                <div className="font-bold text-slate-900 text-sm mt-1">{selectedCustomer.name}</div>
                <div className="text-slate-600 mt-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {selectedCustomer.phone || 'No phone recorded'}
                </div>
                {selectedCustomer.email && (
                  <div className="text-slate-600 mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {selectedCustomer.email}
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Address</span>
                <div className="text-slate-700 mt-1 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{selectedCustomer.address || 'No physical address recorded'}</span>
                </div>
                <div className="mt-2">
                  <Badge variant={selectedCustomer.status === 'Active' ? 'success' : 'default'} size="sm">
                    {selectedCustomer.status}
                  </Badge>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Account Financials</span>
                <div className="text-xl font-black text-[#F5B900] mt-1">
                  ₹{selectedCustomer.total_purchase_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  {selectedCustomer.transaction_count} transaction{selectedCustomer.transaction_count === 1 ? '' : 's'} completed
                </div>
                {selectedCustomer.registered_at && (
                  <div className="text-slate-400 text-[11px] mt-1">
                    Customer since: {new Date(selectedCustomer.registered_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>

            {/* Invoices History Section */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Associated Sales Invoices ({selectedCustomer.bills?.length || 0})
                </h4>
              </div>

              {!selectedCustomer.bills || selectedCustomer.bills.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-400 border border-slate-200">
                  <Receipt className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No invoice transactions linked to this customer account yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3">Invoice No</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Payment Mode</th>
                        <th className="py-2.5 px-3 text-right">Total Amount</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedCustomer.bills.map((b) => (
                        <tr key={b.invoice_no} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            {b.invoice_no}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {b.created_at ? new Date(b.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-700 text-[11px]">
                              {b.payment_mode}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900">
                            ₹{b.total.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant={b.status === 'PAID' ? 'success' : 'danger'} size="sm">
                              {b.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <a
                              href={`/bill/${b.invoice_no}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-600 hover:text-gold-600 font-bold underline text-[11px]"
                            >
                              View
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsDetailModalOpen(false);
                  handleOpenEdit(selectedCustomer);
                }}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition border border-slate-200"
              >
                Edit Profile
              </button>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

