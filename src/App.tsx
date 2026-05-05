import { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { useAuthStore } from "./store/useAuthStore";

import Dashboard from "./pages/Dashboard";
import ProductsList from "./pages/Products";
import EventsSpace from "./pages/Events";
import HistoryArea from "./pages/History";
import ReportPage from "./pages/Report";
import Login from "./pages/Login";
import Analytics from "./pages/Analytics";
import SurgicalSetup from "./pages/SurgicalSetup";
import Settings from "./pages/Settings";
import Register from "./pages/Register";
import AdminVenues from "./pages/AdminVenues";
import AdminUsers from "./pages/AdminUsers";
import Arrivals from "./pages/Arrivals";
import ActivityLog from "./pages/ActivityLog";
import OrderReview from "./pages/OrderReview";

function App() {
  const { user, isLoading, checkUser, role } = useAuthStore();

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/" />} />
        <Route path="/surgical-setup" element={<SurgicalSetup />} />
        
        <Route element={user ? <AppShell /> : <Navigate to="/login" />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products/*" element={<ProductsList />} />
          <Route path="/events/*" element={<EventsSpace />} />
          <Route path="/history/*" element={<HistoryArea />} />
          <Route path="/history/:eventId" element={<ReportPage />} />
          <Route path="/arrivals" element={<Arrivals />} />
          <Route path="/order-review" element={<OrderReview />} />
          <Route path="/log" element={<ActivityLog />} />
          {(role === 'admin' || role === 'super_admin' || role === 'staff' || role === 'osservatore') && <Route path="/analytics" element={<Analytics />} />}
          {(role === 'admin' || role === 'super_admin' || role === 'staff') && <Route path="/team" element={<Settings />} />}
          {role === 'super_admin' && <Route path="/admin/venues" element={<AdminVenues />} />}
          {role === 'super_admin' && <Route path="/admin/users" element={<AdminUsers />} />}
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
