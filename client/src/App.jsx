import { Route, Routes } from 'react-router-dom';
import { AnnouncerProvider } from './components/AnnouncerProvider.jsx';
import AppShell from './components/AppShell.jsx';
import { IdentityProvider } from './components/IdentityProvider.jsx';
import Approvals from './pages/Approvals.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewRequest from './pages/NewRequest.jsx';
import NotFound from './pages/NotFound.jsx';
import Requests from './pages/Requests.jsx';

// The router itself is mounted by the caller: the browser gets a BrowserRouter from
// main.jsx, tests get a MemoryRouter pointed at the route under test.
export default function App() {
  return (
    <IdentityProvider>
      <AnnouncerProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/requests/new" element={<NewRequest />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AnnouncerProvider>
    </IdentityProvider>
  );
}
