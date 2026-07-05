import React from 'react';
import { UploadCloud, Loader2, AlertCircle, CheckCircle, X, Network } from 'lucide-react';
import { useTasks } from '../contexts/TaskContext';

const LineagePage = () => {
  const { extractTasks, uploadFile, removeTask } = useTasks();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const file = files[0];
    uploadFile(file);
    
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
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
        </div>
      )}
    </div>
  );
};

export default LineagePage;
