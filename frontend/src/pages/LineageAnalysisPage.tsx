import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen, Edit2, Trash2, Save, X, Loader2, UploadCloud, AlertCircle, CheckCircle } from 'lucide-react';

interface Knowledge {
  id: string;
  content: string;
  created_at?: string;
}

import { useTasks } from '../contexts/TaskContext';
const KnowledgePage = () => {
  const [knowledgeList, setKnowledgeList] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState('');
  
  const { extractTasks, uploadFile, removeTask } = useTasks();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchKnowledge = async () => {
    try {
      const res = await axios.get('/api/knowledge');
      setKnowledgeList(res.data.data || []);
    } catch (e) {
      console.error("Failed to fetch knowledge", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledge();
  }, []);

  const handleEdit = (k: Knowledge) => {
    setEditingId(k.id);
    setEditContent(k.content);
  };

  const handleSave = async (id: string) => {
    if (!editContent.trim()) return;
    try {
      await axios.put(`/api/knowledge/${id}`, { content: editContent });
      setEditingId(null);
      fetchKnowledge();
    } catch (e) {
      alert("更新失败");
    }
  };

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    try {
      await axios.post('/api/knowledge/approve', { items: [newContent] });
      setIsAdding(false);
      setNewContent('');
      fetchKnowledge();
    } catch (e) {
      alert("添加失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除这条规则吗？")) return;
    try {
      await axios.delete(`/api/knowledge/${id}`);
      fetchKnowledge();
    } catch (e) {
      alert("删除失败");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const file = files[0];
    uploadFile(file, () => {
        fetchKnowledge();
    });
    
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-row mb-6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <BookOpen size={28} color="var(--primary)" />
          <h1 style={{ margin: 0, marginLeft: '0.5rem' }}>知识库管理</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
            <input 
                type="file" 
                accept=".csv,.sql" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileUpload}
            />
            <button className="secondary" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={16} />
              批量血缘提炼 (CSV/SQL)
            </button>
            <button className="primary" onClick={() => setIsAdding(true)}>
              + 添加知识
            </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        这里存放了 Agent 在过去的会话中自动学习并记录的业务规则、用户习惯和造数场景。您可以手动查阅、修改或删除它们。
      </p>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : knowledgeList.length === 0 && extractTasks.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
          <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>当前知识库为空，快去与 Agent 交互并保存新知识吧！</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>

          {extractTasks.map(task => {
             const isRunning = task.status === 'running';
             const isError = task.status === 'error';
             const isFinished = task.status === 'finished';
             const statusColor = isError ? 'var(--danger)' : (isFinished ? 'var(--success)' : 'var(--accent)');
             const statusIcon = isRunning ? <Loader2 size={18} className="spinner" /> : (isError ? <AlertCircle size={18} /> : <CheckCircle size={18} />);

             return (
               <div key={task.id} className="glass-panel" style={{ padding: '1.5rem', border: `1px solid ${statusColor}`, marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: statusColor }}>
                          {statusIcon} {task.filename}
                      </div>
                      {task.status !== 'running' && (
                          <button className="icon-btn" onClick={() => removeTask(task.id)} title="清除日志" style={{ padding: '0.2rem' }}>
                              <X size={16} />
                          </button>
                      )}
                  </div>
                  
                  {isRunning && task.progress.total > 0 && (
                      <div style={{ width: '100%', backgroundColor: 'rgba(0,0,0,0.5)', height: '6px', borderRadius: '3px', marginBottom: '1rem', overflow: 'hidden' }}>
                          <div style={{ 
                              width: `${(task.progress.current / task.progress.total) * 100}%`, 
                              backgroundColor: 'var(--accent)', 
                              height: '100%', 
                              transition: 'width 0.3s ease' 
                          }} />
                      </div>
                  )}
                  
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', maxHeight: '150px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {task.logs.map((log, i) => (
                          <div key={i} style={{ color: log.includes('错误') || log.includes('失败') || log.includes('异常') ? 'var(--danger)' : (log.includes('完成') || log.includes('成功') ? 'var(--primary)' : 'var(--text-muted)'), marginBottom: '0.2rem' }}>
                              {log}
                          </div>
                      ))}
                  </div>
               </div>
             );
          })}
          {isAdding && (
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', border: '1px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 'bold' }}>新增知识</span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="primary icon-btn" onClick={handleAdd} title="保存">
                    <Save size={16} />
                  </button>
                  <button className="secondary icon-btn" onClick={() => setIsAdding(false)} title="取消">
                    <X size={16} />
                  </button>
                </div>
              </div>
              <textarea
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                style={{ minHeight: '100px', width: '100%', resize: 'vertical', padding: '0.8rem', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                autoFocus
                placeholder="请输入要让 Agent 记住的业务口径、造数规则等..."
              />
            </div>
          )}
          {knowledgeList.map(k => (
            <div key={k.id} className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  ID: {k.id} • {new Date(k.created_at).toLocaleString()}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {editingId === k.id ? (
                    <>
                      <button className="primary icon-btn" onClick={() => handleSave(k.id)} title="保存">
                        <Save size={16} />
                      </button>
                      <button className="secondary icon-btn" onClick={() => setEditingId(null)} title="取消">
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="secondary icon-btn" onClick={() => handleEdit(k)} title="编辑">
                        <Edit2 size={16} />
                      </button>
                      <button className="danger icon-btn" onClick={() => handleDelete(k.id)} title="删除" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === k.id ? (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  style={{ minHeight: '100px', width: '100%', resize: 'vertical', padding: '0.8rem', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                  autoFocus
                />
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{k.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
      
      <style>{`
        .icon-btn { padding: 0.5rem; display: flex; align-items: center; justify-content: center; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default KnowledgePage;
