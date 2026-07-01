import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DatabaseZap, Play, Loader2, CheckCircle, Table, ChevronRight, ChevronDown, Folder, FileText, ArrowRightLeft, Sparkles, Plus, Trash2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SearchableSelect } from '../components/SearchableSelect';

interface Proposal {
  sql: string;
  reasoning: string;
}

interface SelectedTable {
  schema: string;
  table: string;
}

interface ChatMessage {
  role: string;
  content: string;
}

const selectStyle = {
  padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', flex: 1
};

const btnIconStyle = {
  padding: '0.4rem', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)'
};


const BasicGenerationPage = () => {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  const [tableFields, setTableFields] = useState<any[]>([]);
  
  const [loadingTree, setLoadingTree] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string>('');
  
  const [executionResult, setExecutionResult] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'dual' | 'ai'>('dual');

  // Dual Tab State
  const [sourceSchema, setSourceSchema] = useState<string>('');
  const [sourceTableName, setSourceTableName] = useState<string>('');
  const [sourceFields, setSourceFields] = useState<any[]>([]);
  const [matchKeys, setMatchKeys] = useState<{target: string, source: string}[]>([{target: '', source: ''}]);
  const [updateFields, setUpdateFields] = useState<{target: string, source: string}[]>([{target: '', source: ''}]);
  const [dualSqlPreview, setDualSqlPreview] = useState<string>('');

  type MatchingStrategy = 'exact' | 'random' | 'grouped';
  const [matchingStrategy, setMatchingStrategy] = useState<MatchingStrategy>('exact');
  const [groupTargetKey, setGroupTargetKey] = useState<string>('');

  // AI Tab State
  const [aiTargetField, setAiTargetField] = useState<string>('');
  const [aiPromptInput, setAiPromptInput] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<string>('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  
  const aiChatBottomRef = useRef<HTMLDivElement>(null);

  // Resize Sidebar State
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = Math.max(200, Math.min(e.clientX - 20, 800));
      setSidebarWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Auto scroll AI chat
  useEffect(() => {
    if (activeTab === 'ai') {
      aiChatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, currentAssistantMessage, proposals, generateStatus, activeTab]);

  // Fetch schemas on load
  useEffect(() => {
    const fetchSchemas = async () => {
      try {
        setLoadingTree(true);
        setErrorStatus('');
        const res = await axios.get('/api/db/schemas');
        if (res.data.status === 'success') {
          const list = res.data.data;
          if (list.length === 0) {
            setErrorStatus('暂无数据库 Schema 数据，请确认数据库连接。');
          } else {
            setSchemas(list);
            if (list.includes('public')) {
              setSelectedSchema('public');
            } else if (list.length > 0) {
              setSelectedSchema(list[0]);
            }
          }
        }
      } catch (e: any) {
        setErrorStatus('无法获取数据库 Schema，请先在配置页检查连接。');
        console.error("Failed to fetch schemas", e);
      } finally {
        setLoadingTree(false);
      }
    };
    fetchSchemas();
  }, []);

  // Fetch tables when selectedSchema changes
  useEffect(() => {
    if (!selectedSchema) {
      setTables([]);
      return;
    }
    const fetchTables = async () => {
      try {
        setLoadingTables(true);
        const res = await axios.get(`/api/db/schema/${selectedSchema}/tables`);
        if (res.data.status === 'success') {
          setTables(res.data.data);
        }
      } catch (e) {
        console.error("Failed to fetch tables", e);
      } finally {
        setLoadingTables(false);
      }
    };
    fetchTables();
  }, [selectedSchema]);

  // Fetch target table fields
  useEffect(() => {
    if (!selectedTable) {
      setTableFields([]);
      setMatchKeys([{target: '', source: ''}]);
      setUpdateFields([{target: '', source: ''}]);
      setDualSqlPreview('');
      setAiTargetField('');
      setAiPromptInput('');
      setMessages([]);
      setHistory([]);
      setProposals([]);
      return;
    }
    const fetchFields = async () => {
      try {
        const res = await axios.get(`/api/db/schema/${selectedTable.schema}/${selectedTable.table}/fields`);
        if (res.data.status === 'success') {
          setTableFields(res.data.data);
        }
      } catch (e) {
        console.error("Failed to fetch fields", e);
      }
    };
    fetchFields();
  }, [selectedTable]);

  // Fetch source table fields (Dual Tab)
  useEffect(() => {
    if (sourceSchema && sourceTableName) {
      const fetchSourceFields = async () => {
        try {
          const res = await axios.get(`/api/db/schema/${sourceSchema}/${sourceTableName}/fields`);
          if (res.data.status === 'success') {
            setSourceFields(res.data.data);
          }
        } catch (e) {
          console.error("Failed to fetch source fields", e);
        }
      };
      fetchSourceFields();
    } else {
      setSourceFields([]);
    }
  }, [sourceSchema, sourceTableName]);

  const [sourceTables, setSourceTables] = useState<string[]>([]);
  useEffect(() => {
    if (!sourceSchema) {
      setSourceTables([]);
      return;
    }
    const fetchSourceTables = async () => {
      try {
        const res = await axios.get(`/api/db/schema/${sourceSchema}/tables`);
        if (res.data.status === 'success') {
          setSourceTables(res.data.data);
        }
      } catch (e) {
        console.error("Failed to fetch source tables", e);
      }
    };
    fetchSourceTables();
  }, [sourceSchema]);

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

  // --- Dual Tab Functions ---
  const generateDualSql = () => {
    if (!selectedTable || !sourceSchema || !sourceTableName) return;
    
    const targetName = `${selectedTable.schema}.${selectedTable.table}`;
    const sourceName = `${sourceSchema}.${sourceTableName}`;
    
    const validUpdates = updateFields.filter(f => f.target && f.source);
    if (validUpdates.length === 0) {
      alert("请至少配置一个更新列");
      return;
    }

    if (matchingStrategy === 'exact') {
      const validMatches = matchKeys.filter(f => f.target && f.source);
      if (validMatches.length === 0) {
        alert("精确匹配模式下，请至少配置一个关联键");
        return;
      }
      const setClauses = validUpdates.map(u => `${u.target} = ${sourceName}.${u.source}`).join(',\n    ');
      const whereClauses = validMatches.map(m => `${targetName}.${m.target} = ${sourceName}.${m.source}`).join(' AND ');
      const sql = `UPDATE ${targetName}\nSET ${setClauses}\nFROM ${sourceName}\nWHERE ${whereClauses};`;
      setDualSqlPreview(sql);
    } 
    else if (matchingStrategy === 'random') {
      const setClauses = validUpdates.map(u => `${u.target} = SourceData.${u.source}`).join(',\n    ');
      const sql = `WITH SourceData AS (
    SELECT *, row_number() over() - 1 as __rn
    FROM ${sourceName}
),
TargetData AS (
    SELECT ctid, row_number() over() - 1 as __rn
    FROM ${targetName}
),
TotalSource AS (
    SELECT count(*) as cnt FROM ${sourceName}
)
UPDATE ${targetName}
SET ${setClauses}
FROM TargetData
JOIN TotalSource ON 1=1
JOIN SourceData ON SourceData.__rn = (TargetData.__rn % TotalSource.cnt)
WHERE ${targetName}.ctid = TargetData.ctid;`;
      setDualSqlPreview(sql);
    }
    else if (matchingStrategy === 'grouped') {
      if (!groupTargetKey) {
        alert("分组映射模式下，请选择目标表分组键（例如 cust_no）");
        return;
      }
      const validMatches = matchKeys.filter(f => f.target && f.source);
      if (validMatches.length === 0) {
        alert("分组映射模式下，请至少配置一个明细对应键（例如 indx_no）");
        return;
      }
      const detailMatchClauses = validMatches.map(m => `SourceData.${m.source} = ${targetName}.${m.target}`).join(' AND ');
      const setClauses = validUpdates.map(u => `${u.target} = SourceData.${u.source}`).join(',\n    ');
      
      const sql = `WITH SourceData AS (
    SELECT *, row_number() over(partition by ${validMatches.map(m => m.source).join(', ')} order by random()) as __group_idx
    FROM ${sourceName}
),
TargetGroups AS (
    SELECT ${groupTargetKey}, dense_rank() over(order by ${groupTargetKey}) as __group_idx
    FROM ${targetName}
),
TotalSourceGroups AS (
    SELECT max(__group_idx) as max_idx FROM SourceData
)
UPDATE ${targetName}
SET ${setClauses}
FROM TargetGroups
JOIN TotalSourceGroups ON 1=1
JOIN SourceData ON ${detailMatchClauses} 
               AND SourceData.__group_idx = ((TargetGroups.__group_idx - 1) % TotalSourceGroups.max_idx) + 1
WHERE ${targetName}.${groupTargetKey} = TargetGroups.${groupTargetKey};`;
      setDualSqlPreview(sql);
    }
  };

  // --- AI Tab Functions ---
  const handleAIGenerate = async () => {
    if (!selectedTable || generating || !aiTargetField || !aiPromptInput.trim()) return;
    
    const userMsg = aiPromptInput.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setAiPromptInput('');
    setGenerating(true);
    setProposals([]);
    setCurrentAssistantMessage('');
    setGenerateStatus('连接中...');
    
    const target = `${selectedTable.schema}.${selectedTable.table}`;
    
    let actualPrompt = userMsg;
    // For the first message, inject the system constraint
    if (history.length === 0) {
      let fieldInfo = tableFields.map(f => `${f.name} (${f.type})`).join(', ');
      actualPrompt = `[系统指令: 你当前的任务是配合用户对表 \`${target}\` 的 \`${aiTargetField}\` 字段进行数据清洗和更新规划。已知该表的字段包含: ${fieldInfo}。\n请注意以下核心原则：\n1. 绝对禁止使用 INSERT 语句。\n2. 你的最终方案必须是针对存量数据的 UPDATE 语句，**并且请在 UPDATE 语句之后紧跟一段 SELECT 语句**，用于查询出刚才被 UPDATE 影响的数据。\n3. 因为表结构已提供，请务必跳过额外的数据探查(get_table_schema)，直接理解需求并使用 propose_modification 工具输出方案。]\n\n用户输入: ${userMsg}`;
    }

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: actualPrompt, 
          history: history,
          field_constraints: {} 
        })
      });

      if (!response.body) throw new Error("ReadableStream not yet supported in this browser.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      
      let finalContent = "";

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
              setGenerateStatus(data.message);
            } else if (data.type === 'content_chunk') {
              finalContent += data.chunk;
              setCurrentAssistantMessage(finalContent);
            } else if (data.type === 'tool_call') {
              setGenerateStatus(`正在分析: ${data.name}...`);
            } else if (data.type === 'finished') {
              setHistory(data.messages || []);
              if (data.proposals && data.proposals.length > 0) {
                setProposals(data.proposals);
              }
            } else if (data.type === 'error') {
               setGenerateStatus(`错误: ${data.message}`);
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
      setGenerateStatus('');
    } catch (e: any) {
      setGenerateStatus(`分析失败: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', gap: '1rem', overflow: 'hidden' }} className="animate-fade-in">
      
      {/* Sidebar: Schema Tree */}
      <div className="glass-panel" style={{ width: `${sidebarWidth}px`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <DatabaseZap size={18} /> 数据探查
        </h3>
        <input 
          type="text" 
          placeholder="搜索目标表..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '0.9rem', margin: 0 }}
        />
        <div style={{ height: '1px', backgroundColor: 'var(--border)' }}></div>
        
        {/* Schema Selector */}
        <select 
          className="form-select" 
          value={selectedSchema} 
          onChange={(e) => setSelectedSchema(e.target.value)}
          style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', marginBottom: '0.5rem' }}
        >
          <option value="">-- 选择 Schema --</option>
          {schemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        
        {loadingTree ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
            <Loader2 className="spinner" size={16} /> 加载 Schema...
          </div>
        ) : errorStatus ? (
          <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{errorStatus}</div>
        ) : loadingTables ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
            <Loader2 className="spinner" size={16} /> 加载表结构...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            {tables
              .filter(t => !searchQuery || t.toLowerCase().includes(searchQuery.toLowerCase()))
              .map(table => (
                <div 
                  key={table}
                  onClick={() => setSelectedTable({ schema: selectedSchema, table })}
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', 
                    padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.9rem',
                    backgroundColor: selectedTable?.schema === selectedSchema && selectedTable?.table === table ? 'var(--primary)' : 'transparent',
                    color: selectedTable?.schema === selectedSchema && selectedTable?.table === table ? 'white' : 'var(--text-muted)'
                  }}
                >
                  <FileText size={14} />
                  {table}
                </div>
              ))}
            {tables.length === 0 && selectedSchema && !loadingTables && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic', padding: '0.5rem' }}>该 Schema 下无表数据</span>
            )}
          </div>
        )}
      </div>

      {/* Resizer Handle */}
      <div 
        style={{
          width: '8px', 
          cursor: 'col-resize', 
          backgroundColor: 'transparent',
          borderRadius: '4px',
          flexShrink: 0,
          transition: 'background-color 0.2s',
          margin: '0 -4px',
          zIndex: 10
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          isDragging.current = true;
          document.body.style.cursor = 'col-resize';
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--primary)'}
        onMouseLeave={(e) => { if(!isDragging.current) e.currentTarget.style.backgroundColor = 'transparent'; }}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
        
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
           <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <DatabaseZap size={24} /> 篡·数据修改
           </h2>
           {selectedTable && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.8rem', backgroundColor: 'rgba(59, 130, 246, 0.2)', border: '1px solid var(--primary)', borderRadius: '20px', fontSize: '0.9rem' }}>
                 <Table size={16} /> 目标表: <strong>{selectedTable.schema}.{selectedTable.table}</strong>
              </div>
           )}
        </div>

        {!selectedTable ? (
          <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Table size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>请在左侧选择需要修改的目标表</p>
          </div>
        ) : (
          <>
            {/* Tabs Header */}
            <div style={{ display: 'flex', gap: '1rem' }}>
               <button 
                  onClick={() => setActiveTab('dual')}
                  style={{ flex: 1, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: activeTab === 'dual' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: activeTab === 'dual' ? 'white' : 'var(--text-muted)', fontSize: '1.1rem' }}
               >
                  <ArrowRightLeft size={20} /> 表间关联性
               </button>
               <button 
                  onClick={() => setActiveTab('ai')}
                  style={{ flex: 1, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: activeTab === 'ai' ? 'var(--primary)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: activeTab === 'ai' ? 'white' : 'var(--text-muted)', fontSize: '1.1rem' }}
               >
                  <Sparkles size={20} /> 单字段造数
               </button>
            </div>

            {/* Tab 1: Dual Table Update */}
            {activeTab === 'dual' && (
              <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <h3 style={{ margin: 0, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ArrowRightLeft size={20}/> 配置表间关联性</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-1rem' }}>通过关联另一张主表的数据，批量刷新当前目标表中的数据。</p>
                
                {/* Source Table Selection */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                  <span style={{color: 'var(--text-muted)', minWidth: '80px'}}>主表 (源):</span>
                  <SearchableSelect 
                    options={schemas}
                    value={sourceSchema} 
                    onChange={(v: string) => { setSourceSchema(v); setSourceTableName(''); }} 
                    placeholder="-- 搜索 Schema --"
                    style={{ flex: 1 }}
                  />
                  <SearchableSelect 
                    options={sourceTables}
                    value={sourceTableName} 
                    onChange={(v: string) => setSourceTableName(v)} 
                    placeholder="-- 搜索 Table --"
                    disabled={!sourceSchema}
                    style={{ flex: 1 }}
                  />
                </div>

                {sourceSchema && sourceTableName && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    
                    {/* Matching Strategy */}
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                       <h4 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                         匹配策略 (Matching Strategy)
                       </h4>
                       <div style={{ display: 'flex', gap: '1rem' }}>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                           <input type="radio" value="exact" checked={matchingStrategy === 'exact'} onChange={() => setMatchingStrategy('exact')} />
                           精确匹配 (Exact Match)
                         </label>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                           <input type="radio" value="random" checked={matchingStrategy === 'random'} onChange={() => setMatchingStrategy('random')} />
                           随机抽样 (Random Sampling)
                         </label>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                           <input type="radio" value="grouped" checked={matchingStrategy === 'grouped'} onChange={() => setMatchingStrategy('grouped')} />
                           分组映射 (Grouped Mapping)
                         </label>
                       </div>
                       
                       {matchingStrategy === 'random' && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.8rem' }}>* 将从主表中顺序/随机抽取记录，为目标表中的每一行分配数据，无需关联条件。</p>}
                       {matchingStrategy === 'grouped' && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.8rem' }}>* 将目标表按指定分组键（如客户号）划分为多个数据组，并从主表中抽取整批“数据套”分配给客户，保证组内明细数据完全对应且隔离。</p>}
                    </div>

                    {/* Group Target Key for Grouped Mapping */}
                    {matchingStrategy === 'grouped' && (
                      <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                         <h4 style={{ margin: '0 0 1rem 0' }}>目标表分组键 (Target Group Key)</h4>
                         <select className="form-select" value={groupTargetKey} onChange={e => setGroupTargetKey(e.target.value)} style={selectStyle}>
                            <option value="">-- 选择目标表分组键 (如 cust_no) --</option>
                            {tableFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                         </select>
                      </div>
                    )}

                    {/* Match Keys */}
                    {matchingStrategy !== 'random' && (
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                       <h4 style={{ margin: '0 0 1rem 0' }}>{matchingStrategy === 'grouped' ? '明细对应键 (Detail Match Keys)' : '关联条件 (Match Keys)'}</h4>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                         {matchKeys.map((mk, idx) => (
                           <div key={`mk-${idx}`} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                             <select className="form-select" value={mk.target} onChange={e => { const newMk = [...matchKeys]; newMk[idx].target = e.target.value; setMatchKeys(newMk); }} style={selectStyle}>
                                <option value="">-- 目标表字段 --</option>
                                {tableFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                             </select>
                             <span style={{ color: 'var(--text-muted)' }}>=</span>
                             <select className="form-select" value={mk.source} onChange={e => { const newMk = [...matchKeys]; newMk[idx].source = e.target.value; setMatchKeys(newMk); }} style={selectStyle}>
                                <option value="">-- 主表字段 --</option>
                                {sourceFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                             </select>
                             <button style={btnIconStyle} onClick={() => { const newMk = [...matchKeys]; newMk.splice(idx, 1); setMatchKeys(newMk); }}>
                               <Trash2 size={16} />
                             </button>
                           </div>
                         ))}
                       </div>
                       <button 
                         onClick={() => setMatchKeys([...matchKeys, {target: '', source: ''}])} 
                         style={{ marginTop: '1rem', backgroundColor: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', width: '100%', padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                         <Plus size={16}/> 添加关联条件
                       </button>
                    </div>
                    )}

                    {/* Update Fields */}
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                       <h4 style={{ margin: '0 0 1rem 0' }}>更新列 (Update Fields)</h4>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                         {updateFields.map((uf, idx) => (
                           <div key={`uf-${idx}`} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                             <select className="form-select" value={uf.target} onChange={e => { const newUf = [...updateFields]; newUf[idx].target = e.target.value; setUpdateFields(newUf); }} style={selectStyle}>
                                <option value="">-- 需要被覆盖的目标字段 --</option>
                                {tableFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                             </select>
                             <span style={{ color: 'var(--text-muted)' }}>← 取值自 ←</span>
                             <select className="form-select" value={uf.source} onChange={e => { const newUf = [...updateFields]; newUf[idx].source = e.target.value; setUpdateFields(newUf); }} style={selectStyle}>
                                <option value="">-- 主表对应字段 --</option>
                                {sourceFields.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                             </select>
                             <button style={btnIconStyle} onClick={() => { const newUf = [...updateFields]; newUf.splice(idx, 1); setUpdateFields(newUf); }}>
                               <Trash2 size={16} />
                             </button>
                           </div>
                         ))}
                       </div>
                       <button 
                         onClick={() => setUpdateFields([...updateFields, {target: '', source: ''}])} 
                         style={{ marginTop: '1rem', backgroundColor: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', width: '100%', padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                         <Plus size={16}/> 添加更新列
                       </button>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                       <button onClick={generateDualSql} style={{ padding: '0.8rem 2rem' }}>
                          预览 UPDATE 语句
                       </button>
                    </div>

                    {dualSqlPreview && (
                      <div className="animate-fade-in" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent)', padding: '1.5rem', borderRadius: '12px' }}>
                        <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent)' }}>SQL 预览</h4>
                        <pre style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                          {dualSqlPreview}
                        </pre>
                        <button className="mt-4" onClick={() => handleExecute(dualSqlPreview)}>
                          <Play size={16} /> 确认并写入数据库
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: AI Single Column Update */}
            {activeTab === 'ai' && (
              <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minHeight: 0 }}>
                <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Sparkles size={20}/> AI 单字段造数</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-1rem' }}>利用大模型对单列数据进行智能批量清洗、脱敏或重新生成。你可以与它多次对话以修正规则。</p>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px' }}>
                  <span style={{color: 'var(--text-muted)', minWidth: '80px'}}>目标字段:</span>
                  <select className="form-select" value={aiTargetField} onChange={e => { setAiTargetField(e.target.value); setMessages([]); setHistory([]); setProposals([]); }} style={selectStyle}>
                    <option value="">-- 选择需要清洗的字段 --</option>
                    {tableFields.map(f => <option key={f.name} value={f.name}>{f.name} ({f.type})</option>)}
                  </select>
                </div>

                {aiTargetField && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                    <div style={{ flex: 1, minHeight: '300px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                       {messages.length === 0 && (
                          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                             <Sparkles size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                             <p>已锁定字段 <b>{aiTargetField}</b>。<br/>请用自然语言描述您的清洗需求开始对话。</p>
                          </div>
                       )}

                       {messages.map((m, i) => (
                         <div key={i} style={{ 
                            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: m.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                            padding: '1rem',
                            borderRadius: '12px',
                            maxWidth: '90%'
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

                       {currentAssistantMessage && (
                          <div style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', maxWidth: '90%' }}>
                            <div className="markdown-body">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentAssistantMessage}</ReactMarkdown>
                            </div>
                          </div>
                       )}

                       {generateStatus && (
                          <div style={{ alignSelf: 'center', color: 'var(--accent)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.5rem 0' }}>
                             <Loader2 size={16} className="spinner" /> {generateStatus}
                          </div>
                       )}

                       {proposals.map((p, i) => (
                         <div key={`prop-${i}`} style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent)', padding: '1.5rem', borderRadius: '12px', alignSelf: 'center', width: '90%', marginTop: '1rem' }}>
                           <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                             <CheckCircle size={18} /> Agent 提出了修改方案
                           </h4>
                           <p style={{ fontSize: '0.95rem', marginBottom: '1rem', color: 'var(--text)' }}><strong>推理说明:</strong> {p.reasoning}</p>
                           <pre style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                             {p.sql}
                           </pre>
                           <button className="mt-4" onClick={() => handleExecute(p.sql)}>
                             <Play size={16} /> 确认并写入数据库
                           </button>
                         </div>
                       ))}
                       <div ref={aiChatBottomRef} />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <input 
                         style={{ flex: 1, margin: 0, padding: '0.8rem', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }} 
                         value={aiPromptInput} 
                         onChange={e => setAiPromptInput(e.target.value)}
                         onKeyDown={e => e.key === 'Enter' && handleAIGenerate()}
                         placeholder="描述对当前列的清洗规则，或纠正模型生成的代码..." 
                         disabled={generating}
                      />
                      <button onClick={handleAIGenerate} disabled={generating || !aiPromptInput.trim()} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.8rem 1.5rem' }}>
                         {generating ? <Loader2 size={18} className="spinner" /> : <Send size={18} />} 发送
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <dialog ref={dialogRef}>
        <h2>执行结果</h2>
        <pre style={{ backgroundColor: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', maxHeight: '300px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {executionResult}
        </pre>
        <form method="dialog" className="mt-4">
          <button className="secondary">关闭</button>
        </form>
      </dialog>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
        .form-select option { background-color: #1a1a2e; color: white; }
      `}</style>
    </div>
  );
};

export default BasicGenerationPage;
