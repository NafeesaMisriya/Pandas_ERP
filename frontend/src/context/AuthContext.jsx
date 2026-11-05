import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../services/api';
import { useToast } from './ToastContext';

const AuthContext = createContext({
  isAdmin: false,
  mode: 'cashier', // 'cashier' | 'admin'
  loading: true,
  unlockAdmin: async () => {},
  lockAdmin: async () => {},
  showLoginModal: false,
  openLoginModal: () => {},
  closeLoginModal: () => {},
});

export const AuthProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const toast = useToast();

  const checkStatus = useCallback(async () => {
    try {
      const res = await authApi.getStatus();
      setIsAdmin(Boolean(res.data?.is_admin));
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const unlockAdmin = async (password) => {
    try {
      const res = await authApi.unlockAdmin(password);
      if (res.data?.success) {
        setIsAdmin(true);
        setShowLoginModal(false);
        toast.success(res.data?.message || 'Admin Mode unlocked successfully');
        return { success: true };
      }
      return { success: false, error: 'Authentication failed' };
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Invalid password or PIN';
      toast.error(errorMsg);
      return { success: false, error: errorMsg, locked: err.response?.data?.locked };
    }
  };

  const lockAdmin = async () => {
    try {
      await authApi.lockAdmin();
      setIsAdmin(false);
      toast.info('Admin Mode locked. System is in Cashier Mode.');
    } catch {
      setIsAdmin(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAdmin,
        mode: isAdmin ? 'admin' : 'cashier',
        loading,
        unlockAdmin,
        lockAdmin,
        showLoginModal,
        openLoginModal: () => setShowLoginModal(true),
        closeLoginModal: () => setShowLoginModal(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

