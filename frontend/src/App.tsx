import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ConfigPage from './pages/ConfigPage';
import AgentChatPage from './pages/AgentChatPage';
import BasicGenerationPage from './pages/BasicGenerationPage';
import SqlEditorPage from './pages/SqlEditorPage';
import KnowledgePage from './pages/KnowledgePage';
import AnalyticsPage from './pages/AnalyticsPage';
import { AgentChatProvider } from './contexts/AgentChatContext';

function App() {
  return (
    <AgentChatProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/config" replace />} />
            <Route path="config" element={<ConfigPage />} />
            <Route path="agent" element={<AgentChatPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="basic" element={<BasicGenerationPage />} />
            <Route path="editor" element={<SqlEditorPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AgentChatProvider>
  );
}

export default App;
