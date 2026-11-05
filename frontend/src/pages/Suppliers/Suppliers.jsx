import React, { useState, useEffect } from 'react';
import {
  Building2,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Truck,
  DollarSign,
  Edit2,
  Eye,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  X
} from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export const Suppliers = () => {
  const toast = useToast();

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form inputs
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    tax_number: '',
    opening_balance: 0,
    status: 'Active',
  });

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await suppliersApi.list(params);
      setSuppliers(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuppliers();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  const handleOpenCreate = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      tax_number: '',
      opening_balance: 0,
      status: 'Active',
    });
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contact_person: supplier.contact_person || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      tax_number: supplier.tax_number || '',
      opening_balance: supplier.opening_balance || 0,
      status: supplier.status || 'Active',
    });
    setIsFormModalOpen(true);
  };

  const handleOpenDetail = async (supplierId) => {
    try {
      setLoadingDetail(true);
      setIsDetailModalOpen(true);
      const res = await suppliersApi.get(supplierId);
      setSelectedSupplier(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load supplier profile');
      setIsDetailModalOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }

    try {
      setSaving(true);
      if (editingSupplier) {
        await suppliersApi.update(editingSupplier.supplier_id, formData);
        toast.success(`Supplier ${editingSupplier.supplier_id} updated successfully`);
      } else {
        const res = await suppliersApi.create(formData);
        toast.success(res.data?.message || 'Supplier registered successfully');
      }
      setIsFormModalOpen(false);
      fetchSuppliers();
      if (selectedSupplier && editingSupplier && selectedSupplier.supplier_id === editingSupplier.supplier_id) {
        handleOpenDetail(editingSupplier.supplier_id);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  // Metrics calculation
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.status === 'Active').length;
  const totalPurchases = suppliers.reduce((sum, s) => sum + (s.total_purchase_value || 0), 0);
  const totalPayables = suppliers.reduce((sum, s) => sum + (s.outstanding_payable || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Procurement</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Supplier Directory</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage vendor contacts, tax profiles, purchase history, and payables</p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-black bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-sm transition active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4 text-[#111111]" />
          <span>New Supplier</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Suppliers</span>
            <Building2 className="w-4 h-4 text-[#F5B900]" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalSuppliers}</div>
          <span className="text-[11px] text-slate-400 font-medium">Vendor accounts registered</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Active Vendors</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{activeSuppliers}</div>
          <span className="text-[11px] text-emerald-600 font-semibold">Active supply channels</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Procurement</span>
            <TrendingUp className="w-4 h-4 text-gold-500" />
          </div>
          <div className="text-2xl font-black text-[#F5B900]">
            ₹{totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Inward stock value</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider">Outstanding Payables</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className={`text-2xl font-black ${totalPayables > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            ₹{totalPayables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Pending vendor settlements</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by vendor name, contact person, phone, or ID..."
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

      {/* Suppliers Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <Loading text="Loading supplier directory..." fullHeight />
        ) : suppliers.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-xs">
            <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-bold text-slate-700 text-sm">No suppliers found</p>
            <p className="text-slate-500 mt-1">
              {searchTerm || statusFilter
                ? 'Try adjusting your search criteria or filter.'
                : 'Click "New Supplier" to register your first vendor profile.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Supplier ID</th>
                  <th className="py-3.5 px-4">Supplier Name</th>
                  <th className="py-3.5 px-4">Contact Person / Phone</th>
                  <th className="py-3.5 px-4">Shipments</th>
                  <th className="py-3.5 px-4">Total Purchases</th>
                  <th className="py-3.5 px-4">Payable Balance</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s.supplier_id} className="hover:bg-gold-50/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {s.supplier_id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 text-xs">{s.name}</div>
                      {s.tax_number && (
                        <div className="text-[11px] text-slate-400 font-mono">GST: {s.tax_number}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {s.contact_person && (
                        <div className="font-semibold text-slate-800">{s.contact_person}</div>
                      )}
                      {s.phone ? (
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {s.phone}
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {s.purchase_count} order{s.purchase_count === 1 ? '' : 's'}
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900">
                      ₹{s.total_purchase_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 font-black">
                      {s.outstanding_payable > 0 ? (
                        <span className="text-amber-600">
                          ₹{s.outstanding_payable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-emerald-600">₹0.00</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={s.status === 'Active' ? 'success' : 'default'} size="sm">
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetail(s.supplier_id)}
                          className="p-1.5 text-slate-400 hover:text-navy-900 hover:bg-gold-50 rounded-lg transition"
                          title="View Profile & Inward History"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(s)}
                          className="p-1.5 text-slate-400 hover:text-[#F5B900] hover:bg-gold-50 rounded-lg transition"
                          title="Edit Supplier"
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

      {/* Supplier Form Modal (Add / Edit) */}
      <Modal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        title={editingSupplier ? `Edit Supplier (${editingSupplier.supplier_id})` : 'Register New Vendor / Supplier'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmitForm} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Supplier / Company Name *</label>
              <input
                type="text"
                placeholder="e.g. Royal Dry Fruits Exports Ltd"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Contact Person</label>
              <input
                type="text"
                placeholder="e.g. Manager / Rep name"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Phone Number</label>
              <input
                type="text"
                placeholder="Mobile / Office number"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Email Address</label>
              <input
                type="email"
                placeholder="vendor@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">GST / Tax Number</label>
              <input
                type="text"
                placeholder="GSTIN number"
                value={formData.tax_number}
                onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Opening Balance (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.opening_balance}
                onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
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
            <label className="block text-slate-600 font-bold mb-1.5">Warehouse / Office Address</label>
            <textarea
              rows={2}
              placeholder="Full address, city, state"
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
              {saving ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Register Supplier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Supplier Detail & Inward Ledger Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={selectedSupplier ? `Supplier Account: ${selectedSupplier.name} (${selectedSupplier.supplier_id})` : 'Supplier Details'}
        maxWidth="max-w-3xl"
      >
        {loadingDetail ? (
          <Loading text="Loading supplier account..." />
        ) : selectedSupplier ? (
          <div className="space-y-5 text-xs">
            {/* Profile Overview Card */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Company & Contact</span>
                <div className="font-bold text-slate-900 text-sm mt-1">{selectedSupplier.name}</div>
                {selectedSupplier.contact_person && (
                  <div className="text-slate-700 font-medium mt-0.5">Contact: {selectedSupplier.contact_person}</div>
                )}
                <div className="text-slate-600 mt-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {selectedSupplier.phone || 'No phone recorded'}
                </div>
                {selectedSupplier.email && (
                  <div className="text-slate-600 mt-0.5 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {selectedSupplier.email}
                  </div>
                )}
              </div>

              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Tax & Registration</span>
                {selectedSupplier.tax_number ? (
                  <div className="font-mono font-bold text-slate-800 mt-1">GSTIN: {selectedSupplier.tax_number}</div>
                ) : (
                  <div className="text-slate-400 mt-1">No GST number recorded</div>
                )}
                <div className="text-slate-700 mt-1 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>{selectedSupplier.address || 'No address recorded'}</span>
                </div>
                <div className="mt-2">
                  <Badge variant={selectedSupplier.status === 'Active' ? 'success' : 'default'} size="sm">
                    {selectedSupplier.status}
                  </Badge>
                </div>
              </div>

              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">Account Financials</span>
                <div className="text-xl font-black text-[#F5B900] mt-1">
                  ₹{selectedSupplier.total_purchase_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  {selectedSupplier.purchase_count} shipment{selectedSupplier.purchase_count === 1 ? '' : 's'} recorded
                </div>
                <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-600">Payable Due:</span>
                  <span className={`font-black ${selectedSupplier.outstanding_payable > 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                    ₹{selectedSupplier.outstanding_payable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Inward Consignments Section */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Recent Consignments ({selectedSupplier.purchases?.length || 0})
                </h4>
              </div>

              {!selectedSupplier.purchases || selectedSupplier.purchases.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl text-slate-400 border border-slate-200">
                  <Truck className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  No purchase consignments recorded under this vendor yet.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3">Voucher #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Receipt Status</th>
                        <th className="py-2.5 px-3">Payment Status</th>
                        <th className="py-2.5 px-3 text-right">Consignment Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedSupplier.purchases.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">
                            #{p.id}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {p.purchase_date}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                              {p.receipt_status}
                            </span>
                          </td>
                          <td className="py-2 px-3">
                            <Badge
                              variant={
                                p.payment_status === 'Paid'
                                  ? 'success'
                                  : p.payment_status === 'Partially Paid'
                                  ? 'warning'
                                  : 'danger'
                              }
                              size="sm"
                            >
                              {p.payment_status} ({p.payment_method})
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900">
                            ₹{p.total.toFixed(2)}
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
                  handleOpenEdit(selectedSupplier);
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

