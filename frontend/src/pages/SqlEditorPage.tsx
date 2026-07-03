import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DatabaseZap, Play, Loader2, Save, Edit3, X, Check } from 'lucide-react';
import { SearchableSelect } from '../components/SearchableSelect';

const btnIconStyle = {
  padding: '0.5rem 1rem', borderRadius: '6px', backgroundColor: 'var(--primary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', fontWeight: 'bold'
};

const SqlEditorPage = () => {
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  
  const [sqlQuery, setSqlQuery] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState('');
  
  const [queryResult, setQueryResult] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };
  
  const [isEditing, setIsEditing] = useState(false);
  const [isInsertMode, setIsInsertMode] = useState(false);
  const [modifiedRows, setModifiedRows] = useState<{ [rowIndex: number]: { [col: string]: any } }>({});
  
  const [updateSql, setUpdateSql] = useState<string>('');
  const [isExecutingUpdate, setIsExecutingUpdate] = useState(false);

  useEffect(() => {
    const fetchSchemas = async () => {
      try {
        const res = await axios.get('/api/db/schemas');
        if (res.data.status === 'success') {
          setSchemas(res.data.data);
        }
      } catch (e) {
        console.error("Failed to fetch schemas", e);
      }
    };
    fetchSchemas();
  }, []);

  useEffect(() => {
    if (!selectedSchema) {
      setTables([]);
      return;
    }
    const fetchTables = async () => {
      try {
        const res = await axios.get(`/api/db/schema/${selectedSchema}/tables`);
        if (res.data.status === 'success') {
          setTables(res.data.data);
        }
      } catch (e) {
        console.error("Failed to fetch tables", e);
      }
    };
    fetchTables();
  }, [selectedSchema]);

  useEffect(() => {
    if (selectedSchema && selectedTable) {
      setSqlQuery(`SELECT * FROM ${selectedSchema}.${selectedTable} LIMIT 100;`);
      setQueryResult([]);
      setColumns([]);
      setModifiedRows({});
      setIsEditing(false);
      setIsInsertMode(false);
      setUpdateSql('');
    }
  }, [selectedSchema, selectedTable]);

  const handleExecuteQuery = async () => {
    if (!sqlQuery.trim()) return;
    setIsExecuting(true);
    setExecutionResult('');
    setModifiedRows({});
    setIsEditing(false);
    setUpdateSql('');
    try {
      const res = await axios.post('/api/db/execute', { sql: sqlQuery });
      if (res.data.status === 'success') {
        const data = res.data;
        if (data.rows !== undefined) {
          setColumns(data.columns || []);
          if (data.rows.length === 0) {
            const emptyRow = (data.columns || []).reduce((acc: any, col: string) => ({...acc, [col]: null}), {});
            setQueryResult([emptyRow]);
            setIsInsertMode(true);
            setIsEditing(true);
            setExecutionResult(`查询成功，数据为空。已自动开启插入模式。`);
          } else {
            setQueryResult(data.rows);
            setIsInsertMode(false);
            setExecutionResult(`查询成功，返回 ${data.rows.length} 条记录。`);
          }
        } else if (data.rowcount !== undefined) {
          setQueryResult([]);
          setColumns([]);
          setIsInsertMode(false);
          setExecutionResult(`执行成功，影响行数: ${data.rowcount}`);
        }
      }
    } catch (e: any) {
      setExecutionResult(`执行失败: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCellChange = (rowIndex: number, col: string, newValue: string) => {
    setModifiedRows(prev => {
      const rowMods = prev[rowIndex] || {};
      return {
        ...prev,
        [rowIndex]: { ...rowMods, [col]: newValue }
      };
    });
  };

  const formatVal = (val: any) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return val;
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  const formatWhere = (col: string, val: any) => {
    if (val === null || val === undefined) return `${col} IS NULL`;
    return `${col} = ${formatVal(val)}`;
  };

  const handleGenerateUpdate = () => {
    if (Object.keys(modifiedRows).length === 0) {
      showToast("没有检测到任何修改！", 'error');
      return;
    }
    if (!selectedSchema || !selectedTable) {
      showToast("请先在顶部选择目标 Schema 和 Table，以便生成准确的语句。", 'error');
      return;
    }

    let sqls: string[] = [];
    if (isInsertMode) {
      for (const [rIdxStr, modifications] of Object.entries(modifiedRows)) {
        const cols = Object.keys(modifications);
        if (cols.length === 0) continue;
        const vals = Object.values(modifications).map(v => formatVal(v));
        const sql = `INSERT INTO ${selectedSchema}.${selectedTable} (${cols.join(", ")}) VALUES (${vals.join(", ")});`;
        sqls.push(sql);
      }
    } else {
      for (const [rIdxStr, modifications] of Object.entries(modifiedRows)) {
        const rIdx = parseInt(rIdxStr);
        const originalRow = queryResult[rIdx];
        if (!originalRow) continue;
        
        const setClauses = Object.entries(modifications).map(([col, val]) => `${col} = ${formatVal(val)}`);
        // Use original row to construct safe WHERE clause
        const whereClauses = Object.entries(originalRow).map(([col, val]) => formatWhere(col, val));
        
        const sql = `UPDATE ${selectedSchema}.${selectedTable} SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")};`;
        sqls.push(sql);
      }
    }
    setUpdateSql(sqls.join("\n"));
  };

  const handleExecuteUpdate = async () => {
    if (!updateSql.trim()) return;
    setIsExecutingUpdate(true);
    try {
      const res = await axios.post('/api/db/execute', { sql: updateSql });
      if (res.data.status === 'success') {
        const rowcount = res.data.rowcount !== undefined ? res.data.rowcount : (res.data.data && res.data.data[0]?.rowcount);
        const countMsg = rowcount !== undefined ? `成功更新了 ${rowcount} 条数据！` : '变更执行成功！';
        showToast(`${countMsg} 将为您重新查询最新数据。`, 'success');
        setUpdateSql('');
        setModifiedRows({});
        setIsEditing(false);
        handleExecuteQuery(); // Re-run SELECT
      }
    } catch (e: any) {
      showToast(`变更执行失败: ${e.response?.data?.detail || e.message}`, 'error');
    } finally {
      setIsExecutingUpdate(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem', padding: '1rem', overflowY: 'auto' }} className="animate-fade-in">
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'error' ? 'var(--danger)' : toast.type === 'success' ? 'var(--success)' : 'var(--primary)',
          color: 'white', padding: '1rem 2rem', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: '1rem', animation: 'fade-in 0.3s ease-out'
        }}>
          <span>{toast.message}</span>
          <X size={16} style={{ cursor: 'pointer' }} onClick={() => setToast(null)} />
        </div>
      )}
      {/* Header */}
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <DatabaseZap size={24} /> 在线数据探查与修改
         </h2>
      </div>

      {/* Selectors */}
      <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{color: 'var(--text-muted)'}}>目标表:</span>
        <SearchableSelect 
          options={schemas}
          value={selectedSchema} 
          onChange={(v: string) => { setSelectedSchema(v); setSelectedTable(''); }} 
          placeholder="-- 搜索 Schema --"
          style={{ width: '200px' }}
        />
        <SearchableSelect 
          options={tables}
          value={selectedTable} 
          onChange={(v: string) => setSelectedTable(v)} 
          placeholder="-- 搜索 Table --"
          disabled={!selectedSchema}
          style={{ width: '300px' }}
        />
      </div>

      {/* SQL Input */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ margin: 0 }}>查询 SQL</h3>
        <textarea 
          className="form-input" 
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          placeholder="输入 SELECT 查询语句..."
          style={{ minHeight: '120px', fontFamily: 'Consolas, monospace' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: executionResult.includes('失败') ? 'var(--danger)' : 'var(--success)', fontSize: '0.9rem' }}>
            {executionResult}
          </span>
          <button style={btnIconStyle} onClick={handleExecuteQuery} disabled={isExecuting}>
            {isExecuting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            执行查询
          </button>
        </div>
      </div>

      {/* Results Grid */}
      {queryResult.length > 0 && (
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>查询结果</h3>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {!isEditing ? (
                <button onClick={() => setIsEditing(true)} style={{ ...btnIconStyle, backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
                  <Edit3 size={16} /> 进入编辑模式
                </button>
              ) : (
                <>
                  <button onClick={() => { setIsEditing(false); setModifiedRows({}); setIsInsertMode(false); }} style={{ ...btnIconStyle, backgroundColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
                    <X size={16} /> 取消编辑
                  </button>
                  <button onClick={handleGenerateUpdate} style={btnIconStyle}>
                    <Check size={16} /> 生成变更 SQL
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div style={{ overflowX: 'auto', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border)' }}>
                  {columns.map(col => (
                    <th key={col} style={{ padding: '0.8rem', whiteSpace: 'nowrap' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResult.map((row, rIdx) => (
                  <tr key={rIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {columns.map(col => {
                      const isModified = modifiedRows[rIdx] && modifiedRows[rIdx].hasOwnProperty(col);
                      const displayVal = isModified ? modifiedRows[rIdx][col] : row[col];
                      
                      return (
                        <td key={col} style={{ 
                          padding: '0.5rem', 
                          whiteSpace: 'nowrap',
                          backgroundColor: isModified ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                          transition: 'background-color 0.2s'
                        }}>
                          {isEditing ? (
                            <input 
                              type="text" 
                              value={displayVal === null ? '' : displayVal}
                              onChange={e => handleCellChange(rIdx, col, e.target.value)}
                              style={{ 
                                width: '100%', 
                                padding: '0.3rem', 
                                backgroundColor: isModified ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)', 
                                border: isModified ? '1px solid var(--success)' : '1px solid transparent', 
                                color: 'white',
                                borderRadius: '4px'
                              }}
                            />
                          ) : (
                            <span style={{ opacity: displayVal === null ? 0.5 : 1 }}>
                              {displayVal === null ? 'NULL' : String(displayVal)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Generated Update SQL */}
      {updateSql && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--success)' }}>
          <h3 style={{ margin: 0, color: 'var(--success)' }}>预览变更 SQL</h3>
          <textarea 
            className="form-input" 
            value={updateSql}
            onChange={(e) => setUpdateSql(e.target.value)}
            style={{ minHeight: '120px', fontFamily: 'Consolas, monospace', border: '1px solid var(--success)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button style={{ ...btnIconStyle, backgroundColor: 'var(--success)' }} onClick={handleExecuteUpdate} disabled={isExecutingUpdate}>
              {isExecutingUpdate ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              执行变更
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SqlEditorPage;
