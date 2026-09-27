import { createContext, useContext } from 'react';

export const DashboardMenuContext = createContext(null);

export function useDashboardMenu() {
  const context = useContext(DashboardMenuContext);
  if (!context) {
    throw new Error('useDashboardMenu must be used within DashboardMenuProvider');
  }
  return context;
}
