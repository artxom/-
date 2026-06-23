import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen, Edit2, Trash2, Save, X, Loader2 } from 'lucide-react';

interface Knowledge {
  id: number;
  content: string;
  created_at: string;
}

const KnowledgePage = () => {
  const [knowledgeList, setKnowledgeList] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');

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

  const handleSave = async (id: number) => {
    if (!editContent.trim()) return;
    try {
      await axios.put(`/api/knowledge/${id}`, { content: editContent });
      setEditingId(null);
      fetchKnowledge();
    } catch (e) {
      alert("更新失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("确定要删除这条规则吗？")) return;
    try {
      await axios.delete(`/api/knowledge/${id}`);
      fetchKnowledge();
    } catch (e) {
      alert("删除失败");
    }
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-row mb-6">
        <BookOpen size={28} color="var(--primary)" />
        <h1 style={{ margin: 0, marginLeft: '0.5rem' }}>知识库管理</h1>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        这里存放了 Agent 在过去的会话中自动学习并记录的业务规则、用户习惯和造数场景。您可以手动查阅、修改或删除它们。
      </p>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : knowledgeList.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
          <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>当前知识库为空，快去与 Agent 交互并保存新知识吧！</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
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
                  style={{ minHeight: '100px', width: '100%', resize: 'vertical' }}
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
