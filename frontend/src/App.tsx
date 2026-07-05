import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ConfigPage from './pages/ConfigPage';
import AgentChatPage from './pages/AgentChatPage';
import BasicGenerationPage from './pages/BasicGenerationPage';
import LineagePage from './pages/LineagePage';
import KnowledgePage from './pages/KnowledgePage';
import SqlEditorPage from './pages/SqlEditorPage';
import AnalyticsPage from './pages/AnalyticsPage';
import { AgentChatProvider } from './contexts/AgentChatContext';
import { TaskProvider } from './contexts/TaskContext';

function App() {
  return (
    <TaskProvider>
      <AgentChatProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/config" replace />} />
              <Route path="config" element={<ConfigPage />} />
              <Route path="agent" element={<AgentChatPage />} />
              <Route path="lineage" element={<LineagePage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="basic" element={<BasicGenerationPage />} />
              <Route path="editor" element={<SqlEditorPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AgentChatProvider>
    </TaskProvider>
  );
}

export default App;
