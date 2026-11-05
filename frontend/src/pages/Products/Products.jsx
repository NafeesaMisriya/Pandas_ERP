import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Upload,
  Edit2,
  Trash2,
  Save,
  Package,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2
} from 'lucide-react';
import { productsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { ProductFormModal } from './ProductFormModal';

export const Products = () => {
  const toast = useToast();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Quick edit state (price and stock inline)
  const [quickEdits, setQuickEdits] = useState({});
  const [savingCode, setSavingCode] = useState(null);

  const fetchCategories = async () => {
    try {
      const res = await productsApi.getCategories();
      setCategories(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCategory) params.category = selectedCategory;
      if (searchTerm) params.search = searchTerm;
      const res = await productsApi.list(params);
      setProducts(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchTerm]);

  // Quick update handler
  const handleQuickChange = (code, field, value) => {
    setQuickEdits((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: value,
      },
    }));
  };

  const handleSaveQuick = async (product) => {
    const edits = quickEdits[product.item_code];
    if (!edits) return;

    const newPrice = edits.price !== undefined ? edits.price : product.price;
    const newStock = edits.stock !== undefined ? edits.stock : product.stock;

    try {
      setSavingCode(product.item_code);
      await productsApi.quickUpdate(product.item_code, {
        price: newPrice,
        stock: newStock,
      });

      toast.success(`Updated ${product.item_code}`);
      // Clean quick edits entry
      setQuickEdits((prev) => {
        const copy = { ...prev };
        delete copy[product.item_code];
        return copy;
      });
      fetchProducts();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update price/stock');
    } finally {
      setSavingCode(null);
    }
  };

  const handleDelete = async (code) => {
    if (!window.confirm(`Are you sure you want to delete product ${code}?`)) return;
    try {
      await productsApi.delete(code);
      toast.success(`Product ${code} removed`);
      fetchProducts();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete product');
    }
  };

  const handleImportCsv = async () => {
    if (!window.confirm('Import catalog items from products.csv? Existing items will not be overwritten.')) return;
    try {
      const res = await productsApi.importCsv();
      toast.success(`Import complete! ${res.data.imported_rows} rows processed.`);
      fetchProducts();
      fetchCategories();
    } catch (err) {
      console.error(err);
      toast.error('Failed to import CSV');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Action Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search & Category Filter */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search code, name, brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <span className="text-xs text-slate-400 font-medium">
            {products.length} products listed
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleImportCsv}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition"
            title="Import from products.csv"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-600" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-700/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <Loading text="Loading catalog records..." fullHeight />
        ) : products.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p>No products match your search or filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Sale Price (₹)</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const currentPrice =
                    quickEdits[p.item_code]?.price !== undefined
                      ? quickEdits[p.item_code].price
                      : p.price;
                  const currentStock =
                    quickEdits[p.item_code]?.stock !== undefined
                      ? quickEdits[p.item_code].stock
                      : p.stock;
                  const isDirty =
                    quickEdits[p.item_code]?.price !== undefined ||
                    quickEdits[p.item_code]?.stock !== undefined;

                  return (
                    <tr key={p.item_code} className="hover:bg-slate-50/70 transition duration-150">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {p.item_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{p.item_name}</div>
                        {p.company && (
                          <div className="text-[11px] text-slate-400 font-medium">
                            Brand: {p.company}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={currentPrice}
                            onChange={(e) =>
                              handleQuickChange(p.item_code, 'price', parseFloat(e.target.value) || 0)
                            }
                            className={`w-20 px-2 py-1 rounded-lg border font-bold text-slate-800 text-xs focus:outline-none ${
                              isDirty
                                ? 'border-amber-400 bg-amber-50/50'
                                : 'border-slate-200 bg-white'
                            }`}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.01"
                          value={currentStock}
                          onChange={(e) =>
                            handleQuickChange(p.item_code, 'stock', parseFloat(e.target.value) || 0)
                          }
                          className={`w-20 px-2 py-1 rounded-lg border font-bold text-slate-800 text-xs focus:outline-none ${
                            isDirty
                              ? 'border-amber-400 bg-amber-50/50'
                              : 'border-slate-200 bg-white'
                          }`}
                        />
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">{p.unit}</td>
                      <td className="py-3 px-4">
                        {p.stock <= 5 ? (
                          <Badge variant="warning" size="sm">
                            Low Stock ({p.stock})
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            In Stock
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isDirty && (
                            <button
                              onClick={() => handleSaveQuick(p)}
                              disabled={savingCode === p.item_code}
                              className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 shadow-sm transition"
                              title="Save Quick Updates"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                            title="Edit Full Profile"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(p.item_code)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      <ProductFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editingProduct}
        categories={categories}
        onSuccess={() => {
          fetchProducts();
          fetchCategories();
        }}
      />
    </div>
  );
};
