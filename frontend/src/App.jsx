import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/layout/Layout';
import { AdminLoginModal } from './components/common/AdminLoginModal';

// Pages
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Billing } from './pages/Billing/Billing';
import { Products } from './pages/Products/Products';
import { Inventory } from './pages/Inventory/Inventory';
import { Purchases } from './pages/Purchases/Purchases';
import { PurchaseHistory } from './pages/PurchaseHistory/PurchaseHistory';
import { Bills } from './pages/Bills/Bills';
import { Reports } from './pages/Reports/Reports';
import { ZReport } from './pages/ZReport/ZReport';
import { Customers } from './pages/Customers/Customers';
import { Suppliers } from './pages/Suppliers/Suppliers';
import { Expenses } from './pages/Expenses/Expenses';
import { ProfitLoss } from './pages/ProfitLoss/ProfitLoss';
import { Payables } from './pages/Payables/Payables';

// Protected Admin Route Guard (Cashier redirect to /billing)
const AdminRoute = ({ children }) => {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) {
    return <Navigate to="/billing" replace />;
  }
  return children;
};

export const App = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="billing" element={<Billing />} />
              <Route path="products" element={<Products />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="purchases" element={<Purchases />} />
              <Route path="purchases/history" element={<PurchaseHistory />} />
              <Route path="bills" element={<Bills />} />
              <Route path="customers" element={<Customers />} />
              <Route path="suppliers" element={<Suppliers />} />

              {/* Admin Protected Routes */}
              <Route path="payables" element={<AdminRoute><Payables /></AdminRoute>} />
              <Route path="reports" element={<AdminRoute><Reports /></AdminRoute>} />
              <Route path="z-report" element={<AdminRoute><ZReport /></AdminRoute>} />
              <Route path="expenses" element={<AdminRoute><Expenses /></AdminRoute>} />
              <Route path="profit-loss" element={<AdminRoute><ProfitLoss /></AdminRoute>} />

              <Route path="*" element={<Navigate to="/billing" replace />} />
            </Route>
          </Routes>
          <AdminLoginModal />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
