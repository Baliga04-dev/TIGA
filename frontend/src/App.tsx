import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { EmailBot } from './pages/EmailBot';
import { Chat } from './pages/Chat';
import { Settings } from './pages/Settings';
import { Agents } from './pages/Agents';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout><Dashboard /></Layout>} />
      <Route path="/email" element={<Layout><EmailBot /></Layout>} />
      <Route path="/chat" element={<Layout><Chat /></Layout>} />
      <Route path="/settings" element={<Layout><Settings /></Layout>} />
      <Route path="/agents" element={<Layout><Agents /></Layout>} />
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}