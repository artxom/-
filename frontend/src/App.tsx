import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ConfigPage from './pages/ConfigPage';
import AgentChatPage from './pages/AgentChatPage';
import BasicGenerationPage from './pages/BasicGenerationPage';
import KnowledgePage from './pages/KnowledgePage';
import AnalyticsPage from './pages/AnalyticsPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/config" replace />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="agent" element={<AgentChatPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="basic" element={<BasicGenerationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
