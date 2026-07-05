import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BookOpen, Edit2, Trash2, Search, Loader2, ArrowUpDown, Download, Upload } from 'lucide-react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import KnowledgeEditor from './KnowledgeEditor';

interface Knowledge {
  id: string;
  content: string;
  target?: string;
  created_at?: string;
}

const KnowledgePage = () => {
  const [knowledgeList, setKnowledgeList] = useState<Knowledge[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Editor State
  const [editingKnowledge, setEditingKnowledge] = useState<Knowledge | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Import State
  const [importDiff, setImportDiff] = useState<any[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Table State
  const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  const fetchKnowledge = async () => {
    setLoading(true);
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

  const handleSaveEdit = async (content: string, target: string) => {
    if (!editingKnowledge) return;
    try {
      await axios.put(`/api/knowledge/${editingKnowledge.id}`, { content, target });
      setEditingKnowledge(null);
      fetchKnowledge();
    } catch (e) {
      alert("更新失败");
    }
  };

  const handleSaveAdd = async (content: string, target: string) => {
    if (!content.trim()) return;
    try {
      await axios.post('/api/knowledge/approve', { items: [{ content, target }] });
      setIsAdding(false);
      fetchKnowledge();
    } catch (e) {
      alert("添加失败");
    }
  };

  const toggleDelete = (id: string) => {
    setPendingDeletes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitDeletes = async () => {
    if (!window.confirm(`确定要彻底删除这 ${pendingDeletes.size} 条知识吗？`)) return;
    setLoading(true);
    try {
      await Promise.all(Array.from(pendingDeletes).map(id => axios.delete(`/api/knowledge/${id}`)));
      setPendingDeletes(new Set());
      await fetchKnowledge();
    } catch (e) {
      alert("批量删除过程出现错误");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    window.open('/api/knowledge/export', '_blank');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', files[0]);
      const res = await axios.post('/api/knowledge/import_preview', formData);
      setImportDiff(res.data.diff);
    } catch (e) {
      alert("解析导入文件失败");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!importDiff) return;
    setIsImporting(true);
    try {
      const updates = importDiff.filter(d => d.action === 'update');
      const adds = importDiff.filter(d => d.action === 'add');
      
      await axios.post('/api/knowledge/import_confirm', { updates, adds });
      setImportDiff(null);
      fetchKnowledge();
      alert(`导入成功！更新了 ${updates.length} 条，新增了 ${adds.length} 条。`);
    } catch (e) {
      alert("导入失败");
    } finally {
      setIsImporting(false);
    }
  };

  const columns = useMemo<ColumnDef<Knowledge>[]>(() => [
    {
      accessorKey: 'target',
      header: ({ column }) => {
        const [showSearch, setShowSearch] = useState(false);
        const filterValue = column.getFilterValue() as string ?? '';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowSearch(!showSearch)}
            >
              知识对象
              <Search size={14} style={{ opacity: showSearch || filterValue ? 1 : 0.3 }} />
            </div>
            {(showSearch || filterValue) && (
              <input
                type="text"
                value={filterValue}
                onChange={e => column.setFilterValue(e.target.value)}
                placeholder="搜索对象..."
                style={{ margin: 0, padding: '0.2rem 0.5rem', fontSize: '0.85rem', height: '26px', width: '130px', fontWeight: 'normal' }}
                onClick={e => e.stopPropagation()}
              />
            )}
          </div>
        );
      },
      cell: info => {
        const target = info.getValue() as string;
        if (!target) return <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>未指定</span>;
        return <span style={{ fontWeight: 500, color: 'var(--primary)' }}>{target}</span>;
      },
      size: 150,
    },
    {
      accessorKey: 'content',
      header: '内容预览',
      cell: info => {
        const content = info.getValue() as string;
        // Strip basic markdown syntax for a cleaner snippet
        const snippet = content.replace(/[_*#`\n>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) + (content.length > 100 ? '...' : '');
        return <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '500px' }} title={content}>{snippet}</div>;
      }
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => {
        return (
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
            onClick={column.getToggleSortingHandler()}
          >
            创建时间
            <ArrowUpDown size={14} style={{ opacity: column.getIsSorted() ? 1 : 0.3 }} />
          </div>
        );
      },
      cell: info => {
        const date = info.getValue() as string;
        return <span style={{ color: 'var(--text-muted)' }}>{date ? new Date(date).toLocaleString() : '-'}</span>;
      },
      size: 180,
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const isPendingDelete = pendingDeletes.has(row.original.id);
        return (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="secondary icon-btn" onClick={() => setEditingKnowledge(row.original)} title="编辑" style={{ padding: '0.4rem' }}>
              <Edit2 size={16} />
            </button>
            <button className="danger icon-btn" onClick={() => toggleDelete(row.original.id)} title={isPendingDelete ? "取消删除" : "标记删除"} style={{ padding: '0.4rem', backgroundColor: isPendingDelete ? 'var(--danger)' : 'rgba(239, 68, 68, 0.1)', color: isPendingDelete ? 'white' : 'var(--danger)', borderColor: isPendingDelete ? 'var(--danger)' : 'rgba(239, 68, 68, 0.3)' }}>
              <Trash2 size={16} />
            </button>
          </div>
        );
      },
      size: 100,
    }
  ], [pendingDeletes]);

  const table = useReactTable({
    data: knowledgeList,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Render Editor Mode
  if (isAdding || editingKnowledge) {
    return (
      <div className="animate-fade-in" style={{ height: '100%' }}>
        <KnowledgeEditor
          title={isAdding ? '新增业务知识' : `编辑知识点 (对象: ${editingKnowledge?.target || '未指定'})`}
          initialContent={editingKnowledge?.content || ''}
          initialTarget={editingKnowledge?.target || ''}
          onSave={isAdding ? handleSaveAdd : handleSaveEdit}
          onCancel={() => {
            setIsAdding(false);
            setEditingKnowledge(null);
          }}
        />
      </div>
    );
  }

  // Render Table Mode
  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-row mb-6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <BookOpen size={28} color="var(--primary)" />
          <h1 style={{ margin: 0, marginLeft: '0.5rem' }}>知识库管理</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {pendingDeletes.size > 0 && (
            <button className="danger" onClick={submitDeletes} style={{ animation: 'fadeIn 0.2s', padding: '0.5rem 1rem' }}>
              <Trash2 size={18} style={{ marginRight: '0.4rem' }} />
              提交删除 ({pendingDeletes.size})
            </button>
          )}
          <div style={{ position: 'relative', width: '250px' }}>
            <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="全局搜索知识点..."
              value={globalFilter ?? ''}
              onChange={e => setGlobalFilter(e.target.value)}
              style={{ margin: 0, paddingLeft: '2.2rem' }}
            />
          </div>
          <button className="secondary" onClick={handleExport} title="导出当前知识库为 JSON">
            <Download size={16} /> 导出
          </button>
          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleImportFile}
          />
          <button className="secondary" onClick={() => fileInputRef.current?.click()} title="导入外部知识库文件">
            {isImporting && !importDiff ? <Loader2 size={16} className="spinner" /> : <Upload size={16} />} 导入
          </button>
          <button className="primary" onClick={() => setIsAdding(true)}>
            + 添加知识
          </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        这里存放了 Agent 在过去的会话中自动学习并记录的业务规则、用户习惯和造数场景。您可以手动查阅、修改或删除它们。
      </p>

      <div className="glass-panel" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Loader2 size={32} className="spinner" />
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(30, 41, 59, 0.95)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th key={header.id} style={{ padding: '1rem', borderBottom: '1px solid var(--border)', fontWeight: 600, color: 'var(--text-main)' }}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} style={{ padding: '4rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                      没有找到匹配的知识点
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map(row => {
                    const isDeleting = pendingDeletes.has(row.original.id);
                    return (
                      <tr 
                        key={row.id} 
                        className="table-row-hover"
                        style={{
                          backgroundColor: isDeleting ? 'rgba(239, 68, 68, 0.05)' : undefined,
                          textDecoration: isDeleting ? 'line-through' : 'none',
                          opacity: isDeleting ? 0.6 : 1,
                          transition: 'all 0.2s'
                        }}
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id} style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {importDiff && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '800px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '2rem' }}>
            <h2 style={{ margin: '0 0 1rem 0' }}>导入差异确认</h2>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid var(--success)', borderRadius: '4px', color: 'var(--success)' }}>
                <strong>{importDiff.filter(d => d.action === 'add').length}</strong> 待新增
              </div>
              <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid var(--warning)', borderRadius: '4px', color: 'var(--warning)' }}>
                <strong>{importDiff.filter(d => d.action === 'update').length}</strong> 待覆盖更新
              </div>
              <div style={{ padding: '0.5rem 1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)' }}>
                <strong>{importDiff.filter(d => d.action === 'skip').length}</strong> 完全重复(跳过)
              </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.8rem', paddingRight: '0.5rem', marginBottom: '1.5rem' }}>
              {importDiff.map((diff, idx) => {
                const target = diff.target || '未指定对象';
                if (diff.action === 'skip') return null; // hide skipped by default to save space
                
                return (
                  <div key={idx} style={{ padding: '1rem', borderLeft: `4px solid ${diff.action === 'add' ? 'var(--success)' : 'var(--warning)'}`, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 'bold', color: diff.action === 'add' ? 'var(--success)' : 'var(--warning)' }}>
                        [{diff.action === 'add' ? '新增' : '更新覆盖'}] {target}
                      </span>
                    </div>
                    {diff.action === 'update' ? (
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1, opacity: 0.6 }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>当前已有内容：</div>
                          <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(255,0,0,0.05)', padding: '0.5rem', borderRadius: '4px' }}>{diff.old_content}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>将要更新为：</div>
                          <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,255,0,0.05)', padding: '0.5rem', borderRadius: '4px' }}>{diff.new_content}</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,255,0,0.05)', padding: '0.5rem', borderRadius: '4px' }}>{diff.content}</div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="secondary" onClick={() => setImportDiff(null)} disabled={isImporting}>取消</button>
              <button className="primary" onClick={confirmImport} disabled={isImporting || importDiff.filter(d => d.action !== 'skip').length === 0}>
                {isImporting ? <Loader2 size={16} className="spinner" /> : <Upload size={16} />}
                确认执行导入
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style>{`
        .icon-btn { display: flex; align-items: center; justify-content: center; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
        .table-row-hover { transition: background-color 0.2s; }
        .table-row-hover:hover { background-color: rgba(255,255,255,0.03); }
        .bn-editor { background: transparent !important; }
      `}</style>
    </div>
  );
};

export default KnowledgePage;

