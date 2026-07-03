import React, { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react';
import axios from 'axios';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Proposal {
  sql: string;
  reasoning: string;
}

export interface ToolExecution {
  id: string;
  name: string;
  args: string;
  result: string;
  status: 'running' | 'done' | 'error';
}

interface AgentChatContextType {
  sessions: {id: string, title: string, updated_at: string}[];
  currentSessionId: string | null;
  messages: ChatMessage[];
  history: any[];
  prompt: string;
  setPrompt: (p: string) => void;
  loading: boolean;
  proposals: Proposal[];
  executionResult: string;
  setExecutionResult: (r: string) => void;
  currentAssistantMessage: string;
  statusMessage: string;
  activeTools: ToolExecution[];
  discoveredKnowledge: string[];
  setDiscoveredKnowledge: (k: string[]) => void;
  selectedKnowledge: Set<number>;
  setSelectedKnowledge: (s: Set<number>) => void;
  goalMode: boolean;
  setGoalMode: (m: boolean) => void;
  extracting: boolean;
  
  fetchSessions: () => Promise<void>;
  loadSession: (id: string) => Promise<void>;
  createNewSession: () => void;
  deleteSession: (id: string, e: React.MouseEvent) => Promise<void>;
  saveSessionFromRef: () => Promise<void>;
  handleSend: () => Promise<void>;
  handleExtractKnowledge: () => Promise<void>;
  handleSaveKnowledge: () => Promise<void>;
  handleExecute: (sql: string, dialogRef?: React.RefObject<HTMLDialogElement>) => Promise<void>;
}

const AgentChatContext = createContext<AgentChatContextType | undefined>(undefined);

export const useAgentChat = () => {
  const context = useContext(AgentChatContext);
  if (!context) throw new Error("useAgentChat must be used within an AgentChatProvider");
  return context;
};

export const AgentChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<{id: string, title: string, updated_at: string}[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const updateSessionId = (id: string | null) => {
    setCurrentSessionIdState(id);
    sessionIdRef.current = id;
  };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistoryState] = useState<any[]>([]);
  const historyRef = useRef<any[]>([]);
  const updateHistory = (newHistory: any[]) => {
    setHistoryState(newHistory);
    historyRef.current = newHistory;
  };
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  
  const [executionResult, setExecutionResult] = useState('');
  
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeTools, setActiveTools] = useState<ToolExecution[]>([]);
  const [discoveredKnowledge, setDiscoveredKnowledge] = useState<string[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Set<number>>(new Set());
  const [goalMode, setGoalMode] = useState(false);
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    fetchSessions();
    const handleBeforeUnload = () => {
      if (historyRef.current.length > 0) {
         const currentHist = historyRef.current;
         const title = currentHist.find((m:any) => m.role === 'user')?.content.substring(0, 20) || '新会话';
         fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: sessionIdRef.current,
              title: title,
              history: currentHist
            }),
            keepalive: true
         }).catch(console.error);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await axios.get('/api/sessions');
      setSessions(res.data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSession = async (id: string) => {
    if (loading) return;
    try {
      const res = await axios.get(`/api/sessions/${id}`);
      const data = res.data.data;
      updateSessionId(data.id);
      updateHistory(data.history);
      
      const reconstructed: ChatMessage[] = [];
      for (const msg of data.history) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            if (msg.content) {
                reconstructed.push({ role: msg.role, content: msg.content });
            }
        }
      }
      setMessages(reconstructed);
      setProposals([]);
    } catch (e) {
      console.error(e);
    }
  };

  const createNewSession = () => {
    if (loading) return;
    if (historyRef.current.length > 0) {
      saveSessionFromRef();
    }
    updateSessionId(null);
    setMessages([]);
    updateHistory([]);
    setProposals([]);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("确定删除该会话？")) return;
    try {
      await axios.delete(`/api/sessions/${id}`);
      if (sessionIdRef.current === id) {
        updateSessionId(null);
        setMessages([]);
        updateHistory([]);
        setProposals([]);
      }
      fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const saveSessionFromRef = async () => {
    const currentHist = historyRef.current;
    if (currentHist.length === 0) return;
    try {
      const title = currentHist.find((m:any) => m.role === 'user')?.content.substring(0, 20) || '新会话';
      const res = await axios.post('/api/sessions', {
        id: sessionIdRef.current,
        title: title,
        history: currentHist
      });
      if (!sessionIdRef.current) {
        updateSessionId(res.data.id);
      }
      fetchSessions();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    
    const userMsg: ChatMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);
    setCurrentAssistantMessage('');
    setStatusMessage('连接中...');
    setActiveTools([]);
    setDiscoveredKnowledge([]);

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg.content, history: historyRef.current, goal_mode: goalMode })
      });

      if (!response.body) throw new Error("ReadableStream not yet supported in this browser.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      
      let finalContent = "";
      let currentActiveTools: ToolExecution[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; 
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'status') {
              setStatusMessage(data.message);
            } else if (data.type === 'content_chunk') {
              finalContent += data.chunk;
              setCurrentAssistantMessage(finalContent);
            } else if (data.type === 'tool_call') {
              const newTool: ToolExecution = {
                id: Math.random().toString(36).substring(7),
                name: data.name,
                args: data.arguments,
                result: '',
                status: 'running'
              };
              currentActiveTools = [...currentActiveTools, newTool];
              setActiveTools(currentActiveTools);
              setStatusMessage(`执行工具: ${data.name}`);
            } else if (data.type === 'tool_result') {
              currentActiveTools = currentActiveTools.map(t => 
                t.name === data.name && t.status === 'running' 
                  ? { ...t, result: data.result, status: data.result.includes('Error') ? 'error' : 'done' } 
                  : t
              );
              setActiveTools(currentActiveTools);
            } else if (data.type === 'finished') {
              updateHistory(data.messages || []);
              saveSessionFromRef();
              if (data.proposals && data.proposals.length > 0) {
                setProposals(data.proposals);
              }
            } else if (data.type === 'error') {
               setStatusMessage(`错误: ${data.message}`);
               break;
            }
          } catch (e) {
             console.error("Error parsing stream JSON", line, e);
          }
        }
      }
      
      if (finalContent) {
        setMessages(prev => [...prev, { role: 'assistant', content: finalContent }]);
        setCurrentAssistantMessage('');
      }
      setStatusMessage('');
      setActiveTools([]);

    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'system', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractKnowledge = async () => {
    if (historyRef.current.length === 0) return alert("当前会话为空，无法归纳知识。");
    setExtracting(true);
    try {
      const res = await axios.post('/api/agent/extract_knowledge', { history: historyRef.current });
      const items = res.data.items || [];
      if (items.length > 0) {
        setDiscoveredKnowledge(items);
        setSelectedKnowledge(new Set(items.map((_: any, i: number) => i)));
      } else {
        alert("未发现新的可归纳知识。");
      }
    } catch (e) {
      alert("归纳失败，请查看控制台日志。");
      console.error(e);
    } finally {
      setExtracting(false);
    }
  };

  const handleSaveKnowledge = async () => {
    const itemsToSave = discoveredKnowledge.filter((_, i) => selectedKnowledge.has(i));
    if (itemsToSave.length === 0) return;
    
    try {
      await axios.post('/api/knowledge/approve', { items: itemsToSave });
      setDiscoveredKnowledge([]);
      alert("知识已成功保存！");
    } catch (e) {
      console.error("Failed to save knowledge", e);
      alert("保存知识失败");
    }
  };

  const handleExecute = async (sql: string, dialogRef?: React.RefObject<HTMLDialogElement>) => {
    try {
      setExecutionResult('执行中...');
      dialogRef?.current?.showModal();
      
      const res = await axios.post('/api/db/execute', { sql });
      setExecutionResult(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
      setExecutionResult(`执行失败: ${e.response?.data?.detail || e.message}`);
    }
  };

  return (
    <AgentChatContext.Provider value={{
      sessions, currentSessionId, messages, history, prompt, setPrompt,
      loading, proposals, executionResult, setExecutionResult,
      currentAssistantMessage, statusMessage, activeTools,
      discoveredKnowledge, setDiscoveredKnowledge, selectedKnowledge, setSelectedKnowledge,
      goalMode, setGoalMode, extracting,
      fetchSessions, loadSession, createNewSession, deleteSession, saveSessionFromRef,
      handleSend, handleExtractKnowledge, handleSaveKnowledge, handleExecute
    }}>
      {children}
    </AgentChatContext.Provider>
  );
};
