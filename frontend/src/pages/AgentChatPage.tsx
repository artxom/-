import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Play, Terminal, CheckCircle, Loader2, DatabaseZap, Code, BookOpen, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Proposal {
  sql: string;
  reasoning: string;
}

interface ToolExecution {
  id: string;
  name: string;
  args: string;
  result: string;
  status: 'running' | 'done' | 'error';
}

const AgentChatPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = sessionStorage.getItem('agentChat_messages');
    return saved ? JSON.parse(saved) : [];
  });
  const [history, setHistory] = useState<any[]>(() => {
    const saved = sessionStorage.getItem('agentChat_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>(() => {
    const saved = sessionStorage.getItem('agentChat_proposals');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('agentChat_messages', JSON.stringify(messages));
    sessionStorage.setItem('agentChat_history', JSON.stringify(history));
    sessionStorage.setItem('agentChat_proposals', JSON.stringify(proposals));
  }, [messages, history, proposals]);

  const [executionResult, setExecutionResult] = useState('');
  
  // Streaming states
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [activeTools, setActiveTools] = useState<ToolExecution[]>([]);
  const [discoveredKnowledge, setDiscoveredKnowledge] = useState<string[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Set<number>>(new Set());
  const [enableExtraction, setEnableExtraction] = useState(true);
  const [goalMode, setGoalMode] = useState(false);
  
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentAssistantMessage, proposals, activeTools]);

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
        body: JSON.stringify({ prompt: userMsg.content, history: history, extract_knowledge: enableExtraction, goal_mode: goalMode })
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
        buffer = lines.pop() || ''; // keep the last partial line in buffer
        
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
              setHistory(data.messages || []);
              if (data.proposals && data.proposals.length > 0) {
                setProposals(data.proposals);
              }
            } else if (data.type === 'knowledge_discovery') {
              setDiscoveredKnowledge(data.items);
              setSelectedKnowledge(new Set(data.items.map((_: any, i: number) => i)));
            } else if (data.type === 'error') {
               setStatusMessage(`错误: ${data.message}`);
               break;
            }
          } catch (e) {
             console.error("Error parsing stream JSON", line, e);
          }
        }
      }
      
      // Complete stream
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

  const handleExecute = async (sql: string) => {
    try {
      setExecutionResult('执行中...');
      dialogRef.current?.showModal();
      
      const res = await axios.post('/api/db/execute', { sql });
      setExecutionResult(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
      setExecutionResult(`执行失败: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('确定要清空当前的所有对话和生成的方案吗？')) {
      setMessages([]);
      setHistory([]);
      setProposals([]);
      sessionStorage.removeItem('agentChat_messages');
      sessionStorage.removeItem('agentChat_history');
      sessionStorage.removeItem('agentChat_proposals');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', overflow: 'hidden' }} className="animate-fade-in">
      {/* Header */}
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <DatabaseZap size={24} /> 数据库智能体
         </h2>
         <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button 
              onClick={handleClearChat}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', backgroundColor: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: '6px', color: 'rgb(252, 165, 165)', cursor: 'pointer' }}
            >
              <Trash2 size={16} /> 清空会话
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={enableExtraction} onChange={e => setEnableExtraction(e.target.checked)} />
              自动提取知识
            </label>
         </div>
      </div>

      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
            <Terminal size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>告诉 Agent 你想怎样造数，例如：</p>
            <p>"帮我给 users 表随机插入 5 条测试数据"</p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} style={{ 
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            backgroundColor: m.role === 'user' ? 'var(--primary)' : (m.role === 'system' ? 'var(--danger)' : 'rgba(255,255,255,0.05)'),
            padding: '1rem',
            borderRadius: '12px',
            maxWidth: '90%',
            overflowX: 'auto'
          }}>
            {m.role === 'user' ? (
              <p style={{ margin: 0, color: 'white', whiteSpace: 'pre-wrap' }}>{m.content}</p>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        
        {/* Streaming / Loading UI */}
        {(currentAssistantMessage || statusMessage || activeTools.length > 0) && (
           <div style={{ 
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(255,255,255,0.05)',
            padding: '1rem',
            borderRadius: '12px',
            maxWidth: '90%'
          }}>
            {statusMessage && (
              <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: currentAssistantMessage ? '1rem' : '0', fontSize: '0.9rem' }}>
                <Loader2 size={16} className="spinner" /> {statusMessage}
              </div>
            )}

            {activeTools.map((t, idx) => (
              <details key={t.id} style={{ marginBottom: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: t.status === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                  {t.name === 'execute_query' ? <DatabaseZap size={14}/> : <Code size={14}/>}
                  调用 {t.name}
                  {t.status === 'running' && <Loader2 size={12} className="spinner" />}
                </summary>
                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                  <p style={{ color: 'var(--text-muted)' }}><strong>Args:</strong> {t.args}</p>
                  {t.result && (
                    <div style={{ marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                      <p style={{ color: 'var(--text-muted)' }}><strong>Result:</strong></p>
                      <pre style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', color: '#a78bfa' }}>{t.result}</pre>
                    </div>
                  )}
                </div>
              </details>
            ))}

            {currentAssistantMessage && (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentAssistantMessage}</ReactMarkdown>
              </div>
            )}
          </div>
        )}
        
        {proposals.map((p, i) => (
          <div key={`prop-${i}`} style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent)', padding: '1rem', borderRadius: '12px', maxWidth: '80%' }}>
            <h4 style={{ color: 'var(--accent)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={18} /> Agent 提出了修改提案
            </h4>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}><strong>推理:</strong> {p.reasoning}</p>
            <pre style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', color: '#e2e8f0', fontFamily: 'monospace' }}>
              {p.sql}
            </pre>
            <button className="mt-4" onClick={() => handleExecute(p.sql)}><Play size={16} /> 审核并执行 SQL</button>
          </div>
        ))}
        
        {discoveredKnowledge.length > 0 && (
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--primary)', padding: '1rem', borderRadius: '12px', maxWidth: '80%', alignSelf: 'center', width: '100%', marginTop: '1rem' }}>
            <h4 style={{ color: 'var(--primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={18} /> 发现新知识！是否保存到长效记忆？
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.5rem' }}>
              {discoveredKnowledge.map((k, i) => (
                <label key={i} style={{ display: 'flex', gap: '0.5rem', cursor: 'pointer', fontSize: '0.95rem', color: 'var(--text)' }}>
                  <input 
                    type="checkbox" 
                    style={{ width: '1.2rem', height: '1.2rem', flexShrink: 0, marginTop: '0.1rem', cursor: 'pointer' }}
                    checked={selectedKnowledge.has(i)}
                    onChange={(e) => {
                      const newSet = new Set(selectedKnowledge);
                      if (e.target.checked) newSet.add(i);
                      else newSet.delete(i);
                      setSelectedKnowledge(newSet);
                    }}
                  />
                  <span>{k}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={handleSaveKnowledge} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                <CheckCircle size={16} /> 保存选中的知识
              </button>
              <button className="secondary" onClick={() => setDiscoveredKnowledge([])} style={{ flex: 1 }}>
                忽略
              </button>
            </div>
          </div>
        )}
        
        <div ref={chatBottomRef} />
      </div>

      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            <input 
              type="checkbox" 
              checked={enableExtraction} 
              onChange={e => setEnableExtraction(e.target.checked)} 
              disabled={loading}
              style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
            />
            归纳知识
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', whiteSpace: 'nowrap', color: goalMode ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: goalMode ? 'bold' : 'normal' }}>
            <input 
              type="checkbox" 
              checked={goalMode} 
              onChange={e => setGoalMode(e.target.checked)} 
              disabled={loading}
              style={{ width: '1.1rem', height: '1.1rem', cursor: 'pointer' }}
            />
            目标模式
          </label>
        </div>
        <textarea 
          style={{ margin: 0, flex: 1, minHeight: '40px', maxHeight: '120px', resize: 'vertical', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.2)', color: 'var(--text)', fontFamily: 'inherit' }} 
          value={prompt} 
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="描述您的造数需求... (Shift+Enter 换行，Enter 发送)" 
          disabled={loading}
          rows={1}
        />
        <button onClick={handleSend} disabled={loading} style={{ whiteSpace: 'nowrap', flexShrink: 0, height: '40px' }}>
          {loading ? <Loader2 size={18} className="spinner" /> : <Send size={18} />} 发送
        </button>
      </div>

      <dialog ref={dialogRef}>
        <h2>执行结果</h2>
        <pre style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', maxHeight: '300px' }}>
          {executionResult}
        </pre>
        <form method="dialog" className="mt-4">
          <button className="secondary">关闭</button>
        </form>
      </dialog>
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default AgentChatPage;
