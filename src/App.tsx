import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";

import Dashboard from "./pages/Dashboard";

import ProductsList from "./pages/Products";

import EventsSpace from "./pages/Events";

import HistoryArea from "./pages/History";

function App() {
  return (
    <Router>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products/*" element={<ProductsList />} />
          <Route path="/events/*" element={<EventsSpace />} />
          <Route path="/history/*" element={<HistoryArea />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
