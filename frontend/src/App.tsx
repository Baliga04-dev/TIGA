import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageHeader } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { EmailBot } from './pages/EmailBot';
import { Chat } from './pages/Chat';
import { Settings } from './pages/Settings';
import { Agents } from './pages/Agents';
import { Outreach } from './pages/Outreach';
import { Reports } from './pages/Reports';
import { Crew } from './pages/Crew';
import { Prompts } from './pages/Prompts';

function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" description="That address doesn't match anything in Tiga." />
      <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/email" element={<EmailBot />} />
        <Route path="/outreach" element={<Outreach />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/crew" element={<Crew />} />
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
