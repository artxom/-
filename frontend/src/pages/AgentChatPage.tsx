import React, { useRef, useEffect } from 'react';
import { Send, Play, Terminal, CheckCircle, Loader2, DatabaseZap, Code, BookOpen, Trash2, Plus, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAgentChat } from '../contexts/AgentChatContext';

const AgentChatPage = () => {
  const {
    sessions, currentSessionId, messages, history, prompt, setPrompt,
    loading, proposals, executionResult,
    currentAssistantMessage, statusMessage, activeTools,
    discoveredKnowledge, selectedKnowledge, setSelectedKnowledge,
    goalMode, setGoalMode, extracting,
    loadSession, createNewSession, deleteSession,
    handleSend, handleExtractKnowledge, handleSaveKnowledge, handleExecute
  } = useAgentChat();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentAssistantMessage, proposals, activeTools]);

  return (
    <div style={{ display: 'flex', height: '100%', gap: '1rem', overflow: 'hidden' }} className="animate-fade-in">
      
      {/* Left Sidebar for Sessions */}
      <div className="glass-panel" style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
        <button className="primary" onClick={createNewSession} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%' }}>
          <Plus size={16} /> 新建会话
        </button>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => loadSession(s.id)}
              style={{ 
                padding: '0.8rem', 
                borderRadius: '8px', 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                backgroundColor: currentSessionId === s.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                border: currentSessionId === s.id ? '1px solid var(--primary)' : '1px solid transparent',
                transition: 'all 0.2s ease'
              }}
              className="session-item"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                <MessageSquare size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem', color: currentSessionId === s.id ? 'var(--primary)' : 'var(--text)' }}>
                  {s.title}
                </span>
              </div>
              <button 
                onClick={(e) => deleteSession(s.id, e)} 
                className="icon-btn danger-hover" 
                style={{ padding: '0.2rem', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                title="删除会话"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem' }}>
           <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <DatabaseZap size={24} /> 智能造数
           </h2>
           <button 
              onClick={handleExtractKnowledge}
              disabled={extracting || loading || history.length === 0}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', 
                backgroundColor: 'rgba(167, 139, 250, 0.2)', 
                border: '1px solid rgba(167, 139, 250, 0.5)', 
                borderRadius: '6px', 
                color: '#c4b5fd', 
                cursor: (extracting || loading || history.length === 0) ? 'not-allowed' : 'pointer',
                opacity: (extracting || loading || history.length === 0) ? 0.5 : 1
              }}
              title={history.length === 0 ? "请先与 Agent 产生对话历史后再尝试归纳" : "归纳全局知识"}
            >
              {extracting ? <Loader2 size={16} className="spinner" /> : <BookOpen size={16} />} 归纳全局知识
            </button>
        </div>

        {/* Chat History */}
        <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '4rem' }}>
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
              wordWrap: 'break-word'
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
              maxWidth: '90%',
              wordWrap: 'break-word'
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
                  <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', wordWrap: 'break-word' }}>
                    <p style={{ color: 'var(--text-muted)' }}><strong>Args:</strong> {t.args}</p>
                    {t.result && (
                      <div style={{ marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                        <p style={{ color: 'var(--text-muted)' }}><strong>Result:</strong></p>
                        <pre style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', color: '#a78bfa', whiteSpace: 'pre-wrap' }}>{t.result}</pre>
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
            <div key={`prop-${i}`} style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent)', padding: '1rem', borderRadius: '12px', maxWidth: '90%', alignSelf: 'flex-start' }}>
              <h4 style={{ color: 'var(--accent)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={18} /> Agent 提出了修改提案
              </h4>
              <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}><strong>推理:</strong> {p.reasoning}</p>
              <pre style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', color: '#e2e8f0', fontFamily: 'monospace' }}>
                {p.sql}
              </pre>
              <button className="mt-4" onClick={() => handleExecute(p.sql, dialogRef)}><Play size={16} /> 审核并执行 SQL</button>
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

        {/* Input Area */}
        <div className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
        .session-item:hover { background-color: rgba(255,255,255,0.05) !important; }
        .danger-hover:hover { color: var(--danger) !important; }
      `}</style>
    </div>
  );
};

export default AgentChatPage;
