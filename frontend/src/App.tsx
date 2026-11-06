import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Shell } from './layout/Shell';
import { ActivityLogsPage } from './pages/ActivityLogs';
import { AdminsPage } from './pages/Admins';
import { DashboardPage } from './pages/Dashboard';
import { DeliveryLogsPage } from './pages/DeliveryLogs';
import { LoginPage } from './pages/Login';
import { ProfilePage } from './pages/Profile';
import { RecipientsPage } from './pages/Recipients';
import { ReminderFormPage } from './pages/ReminderForm';
import { ReminderListPage } from './pages/ReminderList';
import { ReminderPreviewPage } from './pages/ReminderPreview';
import { SettingsPage } from './pages/Settings';
import { TemplatesPage } from './pages/Templates';
import { EmptyState } from './ui/states';

function Guard({ perm, children }: { perm?: string; children: ReactNode }) {
  const { can } = useAuth();
  if (perm && !can(perm)) return <EmptyState icon="lock" title="No access" hint="Your account does not have permission to open this page." />;
  return <>{children}</>;
}

export function App() {
  const { admin, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="auth" aria-busy="true">
        <div className="spinner" role="status" aria-label="Loading" style={{ width: 40, height: 40 }} />
      </div>
    );
  }
  if (!admin) return <LoginPage />;
  // Force a password change (Owner-created or reset accounts) before anything else.
  if (admin.must_change_password && loc.pathname !== '/profile') return <Navigate to="/profile" replace />;

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Guard perm="reminders.read"><DashboardPage /></Guard>} />
        <Route path="reminders/new" element={<Guard perm="reminders.create"><ReminderFormPage /></Guard>} />
        <Route path="reminders/:id/edit" element={<Guard perm="reminders.update"><ReminderFormPage /></Guard>} />
        <Route path="reminders/:id" element={<Guard perm="reminders.read"><ReminderPreviewPage /></Guard>} />
        <Route path="scheduled" element={<Guard perm="reminders.read"><ReminderListPage mode="scheduled" /></Guard>} />
        <Route path="history" element={<Guard perm="reminders.read"><ReminderListPage mode="history" /></Guard>} />
        <Route path="templates" element={<Guard perm="templates.read"><TemplatesPage /></Guard>} />
        <Route path="recipients" element={<Guard perm="recipients.read"><RecipientsPage /></Guard>} />
        <Route path="delivery-logs" element={<Guard perm="logs.delivery"><DeliveryLogsPage /></Guard>} />
        <Route path="activity" element={<Guard perm="logs.activity"><ActivityLogsPage /></Guard>} />
        <Route path="admins" element={<Guard perm="admins.read"><AdminsPage /></Guard>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<EmptyState icon="search" title="Page not found" />} />
      </Route>
    </Routes>
  );
}
