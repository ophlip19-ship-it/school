import { useState } from 'react';
import { DashboardMenuContext } from './DashboardMenuContext';

export default function DashboardMenuProvider({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <DashboardMenuContext.Provider value={{ open, setOpen }}>
      {children}
    </DashboardMenuContext.Provider>
  );
}
