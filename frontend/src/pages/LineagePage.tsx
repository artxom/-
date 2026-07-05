import React, { useState } from 'react';
import { UploadCloud, Loader2, AlertCircle, CheckCircle, X, Network, PauseCircle, PlayCircle, StopCircle, RefreshCw } from 'lucide-react';
import { useTasks } from '../contexts/TaskContext';

const LineagePage = () => {
  const { extractTasks, uploadFile, controlTask, removeTask, retryFailedTask } = useTasks();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [uploadPrompt, setUploadPrompt] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setPendingUploadFile(files[0]);
    
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const confirmUpload = () => {
    if (pendingUploadFile) {
      uploadFile(pendingUploadFile, uploadPrompt, undefined);
      setPendingUploadFile(null);
      setUploadPrompt('');
    }
  };

  const cancelUpload = () => {
    setPendingUploadFile(null);
    setUploadPrompt('');
  };

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-row mb-6" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Network size={28} color="var(--primary)" />
          <h1 style={{ margin: 0, marginLeft: '0.5rem' }}>血缘分析</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
            <input 
                type="file" 
                accept=".csv,.sql" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileUpload}
            />
            <button className="primary" onClick={() => fileInputRef.current?.click()}>
              <UploadCloud size={16} />
              批量血缘提炼 (CSV/SQL)
            </button>
        </div>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
        上传包含加工逻辑的数据文件或 SQL 脚本，后台将通过大模型自动抽提血缘脉络，并在完成时静默入库，随时可切走无需等待。
      </p>

      {extractTasks.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Network size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p>当前暂无血缘提取任务，点击右上角按钮开始提炼吧！</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {extractTasks.map(task => {
             const isRunning = task.status === 'running';
             const isPaused = task.status === 'paused';
             const isStopped = task.status === 'stopped';
             const isError = task.status === 'error';
             const isFinished = task.status === 'finished';
             
             let statusColor = 'var(--accent)';
             
             let completedChunks = 0;
             let errorChunks = 0;
             if (task.chunks && task.chunks.length > 0) {
                 completedChunks = task.chunks.filter(c => c.status === 'done').length;
                 errorChunks = task.chunks.filter(c => c.status === 'error').length;
             }
             const percent = task.chunks && task.chunks.length > 0 ? Math.round((completedChunks / task.chunks.length) * 100) : 0;
             const circumference = 2 * Math.PI * 8; // radius 8
             const strokeDashoffset = circumference - (percent / 100) * circumference;
             
             let statusIcon = isRunning ? (
                <div style={{ position: 'relative', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="12" cy="12" r="8" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                        <circle cx="12" cy="12" r="8" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} style={{ transition: 'stroke-dashoffset 0.3s ease' }} />
                    </svg>
                    <span style={{ position: 'absolute', fontSize: '0.45rem', fontWeight: 'bold' }}>{percent}%</span>
                </div>
             ) : <Loader2 size={18} className="spinner" />;
             
             if (isError) { statusColor = 'var(--danger)'; statusIcon = <AlertCircle size={18} />; }
             else if (isFinished) { statusColor = 'var(--success)'; statusIcon = <CheckCircle size={18} />; }
             else if (isPaused) { statusColor = 'var(--warning)'; statusIcon = <PauseCircle size={18} />; }
             else if (isStopped) { statusColor = 'var(--text-muted)'; statusIcon = <StopCircle size={18} />; }

             return (
               <div key={task.id} className="glass-panel" style={{ padding: '1.5rem', border: `1px solid ${statusColor}`, marginBottom: '1rem', transition: 'all 0.3s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: statusColor }}>
                          {statusIcon} {task.filename} {isPaused && '(已暂停)'} {isStopped && '(已停止)'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {isRunning && (
                              <button className="secondary icon-btn" onClick={() => controlTask(task.id, 'pause')} title="暂停" style={{ padding: '0.3rem' }}>
                                  <PauseCircle size={16} />
                              </button>
                          )}
                          {isPaused && (
                              <button className="primary icon-btn" onClick={() => controlTask(task.id, 'resume')} title="继续" style={{ padding: '0.3rem' }}>
                                  <PlayCircle size={16} />
                              </button>
                          )}
                          {(isRunning || isPaused) && (
                              <button className="danger icon-btn" onClick={() => controlTask(task.id, 'stop')} title="停止" style={{ padding: '0.3rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                                  <StopCircle size={16} />
                              </button>
                          )}
                          {(!isRunning && !isPaused) && errorChunks > 0 && (
                              <button className="primary icon-btn" onClick={() => retryFailedTask(task.id, task.filename)} title="重试失败的块" style={{ padding: '0.3rem', fontSize: '0.8rem', gap: '0.2rem' }}>
                                  <RefreshCw size={14} /> 重试失败 ({errorChunks})
                              </button>
                          )}
                          {(!isRunning && !isPaused) && (
                              <button className="icon-btn" onClick={() => removeTask(task.id)} title="清除记录" style={{ padding: '0.3rem' }}>
                                  <X size={16} />
                              </button>
                          )}
                      </div>
                  </div>
                  
                  {task.chunks && task.chunks.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', marginBottom: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                          {task.chunks.map((chunk, idx) => {
                              let bgColor = 'rgba(255,255,255,0.1)'; // pending
                              if (chunk.status === 'running') bgColor = 'var(--accent)';
                              else if (chunk.status === 'done') bgColor = 'var(--success)';
                              else if (chunk.status === 'error') bgColor = 'var(--danger)';
                              return <div key={idx} title={`Chunk ${idx+1} - ${chunk.status}`} style={{ width: '10px', height: '14px', backgroundColor: bgColor, borderRadius: '2px', transition: 'background-color 0.3s' }} />;
                          })}
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
        </div>
      )}
      
      {pendingUploadFile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div className="glass-panel animate-fade-in" style={{ width: '500px', maxWidth: '90%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.5rem 0' }}>开始血缘解析</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>已选择文件: <strong>{pendingUploadFile.name}</strong></p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>用户提示词 (可选)</label>
              <textarea 
                value={uploadPrompt}
                onChange={e => setUploadPrompt(e.target.value)}
                placeholder="您可以提供一些关于这份文件内容的上下文说明，帮助 AI 更精准地解析血缘结构。例如：“status=1 表示有效数据”、“该文件只包含用户行为流水”等..."
                style={{ minHeight: '200px', height: '250px', resize: 'vertical', fontSize: '0.95rem', lineHeight: '1.5' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="secondary" onClick={cancelUpload}>
                取消
              </button>
              <button className="primary" onClick={confirmUpload}>
                <UploadCloud size={16} />
                开始解析
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LineagePage;
