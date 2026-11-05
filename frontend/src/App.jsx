import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/layout/Layout';

// Pages
import { Dashboard } from './pages/Dashboard/Dashboard';
import { Billing } from './pages/Billing/Billing';
import { Products } from './pages/Products/Products';
import { Purchases } from './pages/Purchases/Purchases';
import { PurchaseHistory } from './pages/PurchaseHistory/PurchaseHistory';
import { Bills } from './pages/Bills/Bills';
import { Reports } from './pages/Reports/Reports';
import { ZReport } from './pages/ZReport/ZReport';

export const App = () => {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="billing" element={<Billing />} />
            <Route path="products" element={<Products />} />
            <Route path="purchases" element={<Purchases />} />
            <Route path="purchases/history" element={<PurchaseHistory />} />
            <Route path="bills" element={<Bills />} />
            <Route path="reports" element={<Reports />} />
            <Route path="z-report" element={<ZReport />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
