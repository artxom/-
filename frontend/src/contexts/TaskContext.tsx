import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface ExtractionTask {
  id: string;
  filename: string;
  status: 'running' | 'finished' | 'error';
  progress: { current: number; total: number };
  logs: string[];
}

interface TaskContextType {
  extractTasks: ExtractionTask[];
  uploadFile: (file: File, onSuccessCallback?: () => void) => void;
  removeTask: (id: string) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [extractTasks, setExtractTasks] = useState<ExtractionTask[]>([]);

  const removeTask = (id: string) => {
    setExtractTasks(prev => prev.filter(t => t.id !== id));
  };

  const uploadFile = async (file: File, onSuccessCallback?: () => void) => {
    const taskId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    
    setExtractTasks(prev => [{
      id: taskId,
      filename: file.name,
      status: 'running',
      progress: { current: 0, total: 0 },
      logs: ['🚀 开始上传并启动后台分析流...', '文件: ' + file.name]
    }, ...prev]);
    
    const updateTask = (id: string, fn: (t: ExtractionTask) => ExtractionTask) => {
        setExtractTasks(prev => prev.map(t => t.id === id ? fn(t) : t));
    };
    
    const appendLog = (id: string, log: string) => {
        updateTask(id, t => ({ ...t, logs: [...t.logs, log] }));
    };
    
    const formData = new FormData();
    formData.append('file', file);
    
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

  return (
    <TaskContext.Provider value={{ extractTasks, uploadFile, removeTask }}>
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
