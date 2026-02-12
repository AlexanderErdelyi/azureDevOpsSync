import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Connectors from './pages/Connectors';
import Metadata from './pages/Metadata';
import SyncConfigs from './pages/SyncConfigs';
import Monitoring from './pages/Monitoring';
import Scheduler from './pages/Scheduler';
import Webhooks from './pages/Webhooks';
import Notifications from './pages/Notifications';
import Conflicts from './pages/Conflicts';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/connectors" element={<Connectors />} />
        <Route path="/metadata" element={<Metadata />} />
        <Route path="/sync-configs" element={<SyncConfigs />} />
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/scheduler" element={<Scheduler />} />
        <Route path="/webhooks" element={<Webhooks />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/conflicts" element={<Conflicts />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default App;
