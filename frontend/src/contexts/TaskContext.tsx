import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface ExtractionTask {
  id: string;
  filename: string;
  status: 'running' | 'paused' | 'stopped' | 'finished' | 'error';
  progress: { current: number; total: number };
  logs: string[];
  chunks: { status: 'pending' | 'running' | 'done' | 'error' }[];
}

interface TaskContextType {
  extractTasks: ExtractionTask[];
  uploadFile: (file: File, prompt?: string, onSuccessCallback?: () => void) => void;
  controlTask: (id: string, action: 'pause' | 'resume' | 'stop') => Promise<void>;
  removeTask: (id: string) => void;
  retryFailedTask: (originalTaskId: string, filename: string, prompt?: string, onSuccessCallback?: () => void) => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [extractTasks, setExtractTasks] = useState<ExtractionTask[]>([]);

  const removeTask = (id: string) => {
    setExtractTasks(prev => prev.filter(t => t.id !== id));
  };

  const controlTask = async (id: string, action: 'pause' | 'resume' | 'stop') => {
    try {
      await fetch(`/api/task/${id}/${action}`, { method: 'POST' });
      setExtractTasks(prev => prev.map(t => {
        if (t.id === id) {
          if (action === 'pause') return { ...t, status: 'paused', logs: [...t.logs, '⏸️ 任务已暂停'] };
          if (action === 'resume') return { ...t, status: 'running', logs: [...t.logs, '▶️ 任务已继续'] };
          if (action === 'stop') return { ...t, status: 'stopped', logs: [...t.logs, '⏹️ 任务已被强制停止'] };
        }
        return t;
      }));
    } catch (e) {
      console.error("Failed to control task", e);
    }
  };

  const uploadFile = async (file: File, prompt?: string, onSuccessCallback?: () => void) => {
    const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    
    setExtractTasks(prev => [{
      id: taskId,
      filename: file.name,
      status: 'running',
      progress: { current: 0, total: 0 },
      logs: ['🚀 开始上传并启动后台分析流...', '文件: ' + file.name],
      chunks: []
    }, ...prev]);
    
    const updateTask = (id: string, fn: (t: ExtractionTask) => ExtractionTask) => {
        setExtractTasks(prev => prev.map(t => t.id === id ? fn(t) : t));
    };
    
    const appendLog = (id: string, log: string) => {
        updateTask(id, t => ({ ...t, logs: [...t.logs, log] }));
    };
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('task_id', taskId);
    if (prompt) {
      formData.append('prompt', prompt);
    }
    
    try {
      const response = await fetch('/api/knowledge/extract_from_csv', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.body) throw new Error("ReadableStream not supported");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        
        for (const part of parts) {
          if (part.startsWith('data: ')) {
            try {
              const data = JSON.parse(part.substring(6));
              
              if (data.type === 'chunk_init') {
                  updateTask(taskId, t => ({
                      ...t,
                      chunks: Array(data.total_chunks).fill({ status: 'pending' })
                  }));
                  continue;
              }
              if (data.type === 'chunk_update') {
                  updateTask(taskId, t => {
                      const newChunks = [...t.chunks];
                      if (data.chunk_index < newChunks.length) {
                          newChunks[data.chunk_index] = { status: data.status };
                      }
                      return { ...t, chunks: newChunks };
                  });
                  continue;
              }
              
              const logMsg = `[${new Date().toLocaleTimeString()}] ${data.message}`;
              
              updateTask(taskId, t => ({
                 ...t,
                 logs: [...t.logs, logMsg],
                 progress: { 
                    current: data.current !== undefined ? data.current : t.progress.current, 
                    total: data.total !== undefined ? data.total : t.progress.total 
                 },
                 status: data.type === 'finished' ? 'finished' : (data.type === 'error' ? 'error' : 'running')
              }));
              
              if (data.type === 'finished' && onSuccessCallback) {
                 setTimeout(onSuccessCallback, 1500);
              }
            } catch (err) {}
          }
        }
      }
    } catch (e: any) {
      appendLog(taskId, `[错误] ${e.message}`);
      updateTask(taskId, t => ({ ...t, status: 'error' }));
    }
  };

  const retryFailedTask = async (originalTaskId: string, filename: string, prompt?: string, onSuccessCallback?: () => void) => {
    const newTaskId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const isSql = filename.toLowerCase().endsWith('.sql');
    
    setExtractTasks(prev => [{
      id: newTaskId,
      filename: `[重试] ${filename}`,
      status: 'running',
      progress: { current: 0, total: 0 },
      logs: ['🚀 开始提取并重试失败的任务块...', '原文件: ' + filename],
      chunks: []
    }, ...prev]);
    
    const updateTask = (id: string, fn: (t: ExtractionTask) => ExtractionTask) => {
        setExtractTasks(prev => prev.map(t => t.id === id ? fn(t) : t));
    };
    const appendLog = (id: string, log: string) => {
        updateTask(id, t => ({ ...t, logs: [...t.logs, log] }));
    };
    
    try {
      const response = await fetch('/api/knowledge/retry_failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: originalTaskId,
          new_task_id: newTaskId,
          prompt: prompt || '',
          is_sql: isSql
        }),
      });
      
      if (!response.ok) {
          const errRes = await response.json();
          throw new Error(errRes.detail || '重试请求失败');
      }
      
      if (!response.body) throw new Error("ReadableStream not supported");
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        
        for (const part of parts) {
          if (part.startsWith('data: ')) {
            try {
              const data = JSON.parse(part.substring(6));
              
              if (data.type === 'chunk_init') {
                  updateTask(newTaskId, t => ({
                      ...t,
                      chunks: Array(data.total_chunks).fill({ status: 'pending' })
                  }));
                  continue;
              }
              if (data.type === 'chunk_update') {
                  updateTask(newTaskId, t => {
                      const newChunks = [...t.chunks];
                      if (data.chunk_index < newChunks.length) {
                          newChunks[data.chunk_index] = { status: data.status };
                      }
                      return { ...t, chunks: newChunks };
                  });
                  continue;
              }
              
              const logMsg = `[${new Date().toLocaleTimeString()}] ${data.message}`;
              updateTask(newTaskId, t => ({
                 ...t,
                 logs: [...t.logs, logMsg],
                 progress: { 
                    current: data.current !== undefined ? data.current : t.progress.current, 
                    total: data.total !== undefined ? data.total : t.progress.total 
                 },
                 status: data.type === 'finished' ? 'finished' : (data.type === 'error' ? 'error' : 'running')
              }));
              
              if (data.type === 'finished' && onSuccessCallback) {
                 setTimeout(onSuccessCallback, 1500);
              }
            } catch (err) {}
          }
        }
      }
    } catch (e: any) {
      appendLog(newTaskId, `[重试错误] ${e.message}`);
      updateTask(newTaskId, t => ({ ...t, status: 'error' }));
    }
  };

  return (
    <TaskContext.Provider value={{ extractTasks, uploadFile, controlTask, removeTask, retryFailedTask }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
