import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NavBar } from './components/NavBar';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

import Dashboard from './pages/Dashboard';
import Administrator from './pages/Administrator';
import AuditTrail from './pages/AuditTrail';

import { HumanResourcesMenu } from './pages/hr/HumanResourcesMenu';
import Payroll from './pages/hr/Payroll';
import CagesTipped from './pages/hr/CagesTipped';
import ShiftA from './pages/hr/ShiftA';
import ShiftB from './pages/hr/ShiftB';
import WorkerList from './pages/hr/WorkerList';
import WorkerAttendanceReport from './pages/hr/WorkerAttendanceReport';
import JobList from './pages/hr/JobList';
import PieceRateSetting from './pages/hr/PieceRateSetting';
import WorkerPortal from './pages/worker/WorkerPortal';
import HumanResourcesUserSettings from './pages/hr/UserSettings';

function RootLayout() {
  const { currentUser, currentWorker, logout, refreshCurrentUser, refreshCurrentWorker } = useAuth();
  const { state, syncStatus } = useApp();

  useEffect(() => {
    refreshCurrentUser(state.userSettings);
  }, [state.userSettings, refreshCurrentUser]);

  useEffect(() => {
    refreshCurrentWorker(state.workers ?? []);
  }, [state.workers, refreshCurrentWorker]);

  if (!currentUser && !currentWorker) return <Login />;

  if (currentWorker) return <WorkerPortal worker={currentWorker} />;

  const isBusy = syncStatus === 'saving' || syncStatus === 'loading';

  return (
    <div className="app">
      <NavBar username={currentUser?.username ?? ''} onLogout={logout} />
      <main className="main">
        <Outlet />
      </main>

      {/* Full-screen overlay while syncing — prevents edits mid-save */}
      {isBusy && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.30)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'wait',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: '#cbd5e1',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          }}>
            <span style={{
              display: 'inline-block',
              width: 16,
              height: 16,
              border: '2px solid #475569',
              borderTopColor: '#60a5fa',
              borderRadius: '50%',
              animation: 'spin 0.75s linear infinite',
              flexShrink: 0,
            }} />
            {syncStatus === 'loading' ? 'Loading…' : 'Saving…'}
          </div>
        </div>
      )}
    </div>
  );
}

const router = createBrowserRouter([
  // Public, outside the auth gate — reached from a password-reset email.
  { path: '/reset-password', element: <ResetPassword /> },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'administrator', element: <Administrator /> },
      { path: 'audit-trail', element: <AuditTrail /> },

      { path: 'human-resources', element: <HumanResourcesMenu /> },
      { path: 'human-resources/payroll', element: <Payroll /> },
      { path: 'human-resources/payroll/shift-a', element: <ShiftA /> },
      { path: 'human-resources/payroll/shift-b', element: <ShiftB /> },
      { path: 'human-resources/payroll/shift-a/cages-tipped', element: <CagesTipped /> },
      { path: 'human-resources/payroll/shift-b/cages-tipped', element: <CagesTipped /> },
      { path: 'human-resources/workers', element: <WorkerList /> },
      { path: 'human-resources/attendance', element: <WorkerAttendanceReport /> },
      { path: 'human-resources/job-list', element: <JobList /> },
      { path: 'human-resources/job-list/piece-rate', element: <PieceRateSetting /> },
      { path: 'human-resources/settings', element: <HumanResourcesUserSettings /> },

    ],
  },
]);

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </AppProvider>
  );
}
