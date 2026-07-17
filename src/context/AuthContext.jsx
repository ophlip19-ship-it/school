import { createContext, useState, useContext, useEffect, useMemo, useCallback } from 'react';
import { authApi, setToken } from '../lib/api';
import { connectSocket, disconnectSocket } from '../lib/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback((token, nextUser) => {
    setToken(token);
    setUser(nextUser);
    if (token) connectSocket(token);
    else disconnectSocket();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('schoolrun_token');
    if (!token) {
      setIsLoading(false);
      return;
    }

    authApi
      .me()
      .then(({ user: me }) => {
        setUser(me);
        connectSocket(token);
      })
      .catch(() => {
        setToken(null);
        setUser(null);
        disconnectSocket();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const registerUser = useCallback(
    async (userData) => {
      const { token, user: created } = await authApi.register({
        email: userData.email,
        password: userData.password,
        name: userData.parentName || userData.name || userData.driverName,
        role: userData.role || 'parent',
        phone: userData.phone || '',
        childName: userData.childName,
        school: userData.school,
        vehiclePlate: userData.vehiclePlate,
      });
      applySession(token, created);
      return created;
    },
    [applySession],
  );

  const login = useCallback(
    async ({ email, password }) => {
      const { token, user: loggedIn } = await authApi.login({ email, password });
      applySession(token, loggedIn);
      return loggedIn;
    },
    [applySession],
  );

  const refreshUser = useCallback(async () => {
    const { user: me } = await authApi.me();
    setUser(me);
    return me;
  }, []);

  const updateUser = useCallback(async (updates) => {
    // Local-only fields vs API fields
    if (updates.name || updates.phone || updates.vehiclePlate) {
      const { user: me } = await authApi.updateMe({
        name: updates.name,
        phone: updates.phone,
        vehiclePlate: updates.vehiclePlate,
      });
      setUser(me);
      return me;
    }
    setUser((prev) => (prev ? { ...prev, ...updates } : prev));
    return null;
  }, []);

  const verifyAccount = useCallback(async () => {
    const { user: me } = await authApi.verify();
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    applySession(null, null);
  }, [applySession]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      registerUser,
      login,
      updateUser,
      refreshUser,
      verifyAccount,
      logout,
    }),
    [user, isLoading, registerUser, login, updateUser, refreshUser, verifyAccount, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
