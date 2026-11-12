import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { Shell } from './layout/Shell';
import { ActivityLogsPage } from './pages/ActivityLogs';
import { AdminsPage } from './pages/Admins';
import { DashboardPage } from './pages/Dashboard';
import { DuePage } from './pages/Due';
import { DeliveryLogsPage } from './pages/DeliveryLogs';
import { LoginPage } from './pages/Login';
import { NoAccessPage } from './pages/NoAccess';
import { PrivacyPage } from './pages/Privacy';
import { ProfilePage } from './pages/Profile';
import { PublicHomePage } from './pages/PublicHome';
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

/** True when opened from the home-screen icon (installed app) instead of a browser tab. */
const isInstalledApp = (() => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
})();

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
  // Visitors without an account see the read-only class page. Panel URLs show "no access"; the sign-in form lives only at /login.
  // (This only hides the form. Real protection is the server, which rejects every panel API call without a valid login.)
  if (!admin) {
    return (
      <Routes>
        <Route path="/" element={isInstalledApp ? <Navigate to="/login" replace /> : <PublicHomePage />} />
        <Route path="/home" element={<PublicHomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="*" element={<NoAccessPage />} />
      </Routes>
    );
  }
  // Force a password change (Owner-created or reset accounts) before anything else.
  if (admin.must_change_password && loc.pathname !== '/profile') return <Navigate to="/profile" replace />;

  return (
    <Routes>
      <Route path="home" element={<PublicHomePage />} />
      <Route path="privacy" element={<PrivacyPage />} />
      <Route path="login" element={<Navigate to="/" replace />} />
      <Route element={<Shell />}>
        <Route index element={<Guard perm="reminders.read"><DashboardPage /></Guard>} />
        <Route path="reminders/new" element={<Guard perm="reminders.create"><ReminderFormPage /></Guard>} />
        <Route path="reminders/:id/edit" element={<Guard perm="reminders.update"><ReminderFormPage /></Guard>} />
        <Route path="reminders/:id" element={<Guard perm="reminders.read"><ReminderPreviewPage /></Guard>} />
        <Route path="due" element={<Guard perm="reminders.read"><DuePage /></Guard>} />
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
