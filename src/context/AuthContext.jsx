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
        vehiclePlate: userData.vehiclePlate,
        homeAddress: userData.homeAddress,
        homeCoords: userData.homeCoords,
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

  const confirmIdentity = useCallback(async (password) => {
    await authApi.confirmIdentity({ password });
    return true;
  }, []);

  const updateUser = useCallback(async (updates) => {
    const {
      currentPassword,
      name,
      phone,
      vehiclePlate,
      homeAddress,
      homeCoords,
      ...localOnly
    } = updates || {};

    const hasProfileFields =
      name !== undefined ||
      phone !== undefined ||
      vehiclePlate !== undefined ||
      homeAddress !== undefined ||
      homeCoords !== undefined;

    if (hasProfileFields) {
      const { user: me } = await authApi.updateMe({
        currentPassword,
        name,
        phone,
        vehiclePlate,
        homeAddress,
        homeCoords,
      });
      setUser(me);
      return me;
    }

    if (Object.keys(localOnly).length > 0) {
      setUser((prev) => (prev ? { ...prev, ...localOnly } : prev));
    }
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
      confirmIdentity,
      refreshUser,
      verifyAccount,
      logout,
    }),
    [
      user,
      isLoading,
      registerUser,
      login,
      updateUser,
      confirmIdentity,
      refreshUser,
      verifyAccount,
      logout,
    ],
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
