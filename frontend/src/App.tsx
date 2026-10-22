import { Link, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PageHeader } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { EmailBot } from './pages/EmailBot';
import { Chat } from './pages/Chat';
import { Meetings } from './pages/Meetings';
import { Settings } from './pages/Settings';
import { Agents } from './pages/Agents';
import { Outreach } from './pages/Outreach';
import { Prospects } from './pages/Prospects';
import { Pipeline } from './pages/Pipeline';
import { Reports } from './pages/Reports';
import { Crew } from './pages/Crew';
import { Prompts } from './pages/Prompts';
import { Learn } from './pages/Learn';
import { Usage } from './pages/Usage';

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
        <Route path="/prospects" element={<Prospects />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/outreach" element={<Outreach />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/crew" element={<Crew />} />
        <Route path="/prompts" element={<Prompts />} />
        <Route path="/learn" element={<Learn />} />
        <Route path="/usage" element={<Usage />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
