import React, { useState, useEffect } from 'react';
import { productsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Upload, Image as ImageIcon, Sparkles, AlertCircle, Check } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { isIntegerUnit, validateUnitQuantity } from '../../utils/unitValidation';

export const ProductFormModal = ({ isOpen, onClose, product, categories = [], onSuccess }) => {
  const toast = useToast();
  const isEdit = !!product?.item_code;

  const [formData, setFormData] = useState({
    item_code: '',
    item_name: '',
    category: '',
    unit: 'kg',
    stock: 0,
    price: 0,
    cost_price: 0,
    sales_tax: 0,
    invoicing_policy: 'Ordered quantities',
    purchase_tax: 0,
    purchase_unit: 'kg',
    income_account: 'Sales',
    expense_account: 'Cost of Goods Sold',
    description: '',
    company: '',
    is_sale: true,
    is_purchase: true,
    is_manufactured: false,
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loadingNextCode, setLoadingNextCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        item_code: product.item_code || '',
        item_name: product.item_name || '',
        category: product.category || (categories[0] || ''),
        unit: product.unit || 'kg',
        stock: product.stock ?? 0,
        price: product.price ?? 0,
        cost_price: product.cost_price ?? 0,
        sales_tax: product.sales_tax ?? 0,
        invoicing_policy: product.invoicing_policy || 'Ordered quantities',
        purchase_tax: product.purchase_tax ?? 0,
        purchase_unit: product.purchase_unit || product.unit || 'kg',
        income_account: product.income_account || 'Sales',
        expense_account: product.expense_account || 'Cost of Goods Sold',
        description: product.description || '',
        company: product.company || '',
        is_sale: product.is_sale ?? true,
        is_purchase: product.is_purchase ?? true,
        is_manufactured: product.is_manufactured ?? false,
      });
      if (product.has_image) {
        setImagePreview(`/product-image/${product.item_code}`);
      } else {
        setImagePreview(null);
      }
    } else {
      const defaultCat = categories[0] || 'Chocolates';
      setFormData({
        item_code: '',
        item_name: '',
        category: defaultCat,
        unit: 'kg',
        stock: 0,
        price: 0,
        cost_price: 0,
        sales_tax: 0,
        invoicing_policy: 'Ordered quantities',
        purchase_tax: 0,
        purchase_unit: 'kg',
        income_account: 'Sales',
        expense_account: 'Cost of Goods Sold',
        description: '',
        company: '',
        is_sale: true,
        is_purchase: true,
        is_manufactured: false,
      });
      setImagePreview(null);
      fetchNextCode(defaultCat);
    }
    setImageFile(null);
  }, [product, categories, isOpen]);

  const fetchNextCode = async (cat) => {
    if (!cat) return;
    try {
      setLoadingNextCode(true);
      const res = await productsApi.getNextCode(cat);
      if (res.data?.item_code) {
        setFormData((prev) => ({ ...prev, item_code: res.data.item_code }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingNextCode(false);
    }
  };

  const handleCategoryChange = (e) => {
    const newCat = e.target.value;
    setFormData((prev) => ({ ...prev, category: newCat }));
    if (!isEdit) {
      fetchNextCode(newCat);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.item_name.trim()) {
      toast.error('Product name is required');
      return;
    }
    if (!formData.category) {
      toast.error('Category is required');
      return;
    }
    if (!formData.unit) {
      toast.error('Unit of measure is required');
      return;
    }

    // Strict Unit-based Quantity Validation
    const stockValidation = validateUnitQuantity(formData.stock, formData.unit);
    if (!stockValidation.valid) {
      toast.error(stockValidation.message);
      return;
    }

    try {
      setSubmitting(true);
      const payload = new FormData();
      Object.entries(formData).forEach(([k, v]) => {
        payload.append(k, v);
      });
      if (imageFile) {
        payload.append('product_image', imageFile);
      }

      if (isEdit) {
        await productsApi.update(formData.item_code, payload);
        toast.success(`Product ${formData.item_code} updated`);
      } else {
        await productsApi.create(payload);
        toast.success(`New product ${formData.item_code} created`);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Product: ${formData.item_code}` : 'Add New Catalog Product'}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Section 1: Product Identification */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <span className="w-5 h-5 rounded-full bg-[#F5B900] text-[#111111] text-[11px] font-black flex items-center justify-center">
              1
            </span>
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Item Classification &amp; Identity
            </h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Department / Category *</label>
              <select
                value={formData.category}
                onChange={handleCategoryChange}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">
                Item Code / SKU *
                {loadingNextCode && <span className="text-gold-600 font-normal ml-1">(auto-generating...)</span>}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.item_code}
                  onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                  required
                  disabled={isEdit}
                  placeholder="e.g. C101"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono font-bold tracking-wider text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] disabled:bg-slate-100 disabled:text-slate-500 shadow-xs"
                />
                {!isEdit && (
                  <button
                    type="button"
                    onClick={() => fetchNextCode(formData.category)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-gold-600 transition"
                    title="Generate next SKU for category"
                  >
                    <Sparkles className="w-4 h-4 text-gold-500" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Brand / Manufacturer</label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder="e.g. Cadbury, Nestle"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Product Name / Description *</label>
            <input
              type="text"
              value={formData.item_name}
              onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
              required
              placeholder="e.g. Dairy Milk Silk Roasted Almond 143g"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>
        </div>

        {/* Section 2: Pricing & Inventory */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <span className="w-5 h-5 rounded-full bg-[#F5B900] text-[#111111] text-[11px] font-black flex items-center justify-center">
              2
            </span>
            <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Pricing &amp; Inventory Specifications
            </h4>
          </div>

          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Sale Price (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Cost Price (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1.5">
                  Initial Stock
                  {isIntegerUnit(formData.unit) && (
                    <span className="text-[11px] text-amber-700 font-semibold ml-1">(Whole nos only)</span>
                  )}
                </label>
                <input
                  type="number"
                  step={isIntegerUnit(formData.unit) ? "1" : "0.01"}
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1.5">Unit of Measure</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
                >
                  <option value="kg">kg (Kilogram)</option>
                  <option value="pc">pc (Piece)</option>
                  <option value="pkt">pkt (Packet)</option>
                  <option value="box">box (Box)</option>
                  <option value="ltr">ltr (Litre)</option>
                  <option value="gm">gm (Gram)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-slate-500 font-semibold mb-1 text-[11px]">Sales Tax (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.sales_tax}
                  onChange={(e) => setFormData({ ...formData, sales_tax: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1 text-[11px]">Purchase Tax (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.purchase_tax}
                  onChange={(e) => setFormData({ ...formData, purchase_tax: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1 text-[11px]">Income Account</label>
                <input
                  type="text"
                  value={formData.income_account}
                  onChange={(e) => setFormData({ ...formData, income_account: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-500 font-semibold mb-1 text-[11px]">Expense Account</label>
                <input
                  type="text"
                  value={formData.expense_account}
                  onChange={(e) => setFormData({ ...formData, expense_account: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Operational Flags */}
        <div className="flex flex-wrap gap-6 py-2.5 px-4 bg-slate-50/60 rounded-xl border border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
            <input
              type="checkbox"
              checked={formData.is_sale}
              onChange={(e) => setFormData({ ...formData, is_sale: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Available for Sale (POS)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
            <input
              type="checkbox"
              checked={formData.is_purchase}
              onChange={(e) => setFormData({ ...formData, is_purchase: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Can be Purchased</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700">
            <input
              type="checkbox"
              checked={formData.is_manufactured}
              onChange={(e) => setFormData({ ...formData, is_manufactured: e.target.checked })}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Manufactured / In-House</span>
          </label>
        </div>

        {/* Section 4: Product Image (PostgreSQL BYTEA) */}
        <div>
          <label className="block text-slate-600 font-bold mb-1.5">Product Image (PostgreSQL BYTEA storage)</label>
          <div className="flex items-center gap-4 p-3 bg-slate-50/60 rounded-2xl border border-slate-200/80">
            <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8 text-slate-300" />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition shadow-xs text-xs active:scale-95">
                <Upload className="w-4 h-4 text-slate-500" />
                <span>{imageFile ? 'Replace Selected Image' : 'Choose File'}</span>
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
              </label>
              <p className="text-[11px] text-slate-400">
                JPEG, PNG or WEBP format. Stored as raw binary in PostgreSQL database.
              </p>
            </div>
          </div>
        </div>

        {/* Form Action Controls */}
        <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition text-xs"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-gold-500 hover:bg-gold-400 text-navy-900 rounded-xl font-bold text-xs shadow-md shadow-gold-500/20 transition disabled:opacity-50 active:scale-95"
          >
            {submitting ? 'Saving to Database...' : isEdit ? 'Save Changes' : 'Create Product'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
