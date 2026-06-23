import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Save, Activity, CheckCircle, AlertTriangle } from 'lucide-react';

const ConfigPage = () => {
  const [config, setConfig] = useState({
    host: '127.0.0.1',
    port: 5432,
    user: 'dbadmin',
    password: '',
    dbname: 'postgres',
    api_key: '',
    base_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-v4-pro'
  });
  const [status, setStatus] = useState('');
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{status: 'success'|'error'|'', message: string}>({status: '', message: ''});
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    axios.get('/api/config').then(res => {
      if (res.data && res.data.db_config) {
        setConfig({
          host: res.data.db_config.host,
          port: res.data.db_config.port,
          user: res.data.db_config.user,
          password: res.data.db_config.password,
          dbname: res.data.db_config.dbname,
          api_key: res.data.api_key,
          base_url: res.data.base_url,
          model: res.data.model
        });
        setStatus('已自动加载上次保存的配置。');
      }
    }).catch(e => console.error("No saved config"));
  }, []);

  const handleSave = async () => {
    try {
      setStatus('Saving...');
      const payload = {
        db_config: {
          host: config.host,
          port: parseInt(config.port.toString(), 10),
          user: config.user,
          password: config.password,
          dbname: config.dbname
        },
        api_key: config.api_key,
        base_url: config.base_url,
        model: config.model
      };
      // For local dev, hardcoding 8000 port
      await axios.post('/api/config', payload);
      setStatus('配置保存成功！数据库已连接。');
    } catch (e: any) {
      setStatus(`配置失败: ${e.response?.data?.detail || e.message}`);
    }
  };

  const handleTestApi = async () => {
    try {
      setTestingApi(true);
      setApiTestResult({status: '', message: '测试中，请稍候...'});
      dialogRef.current?.showModal();
      
      const payload = {
        db_config: { host: '', port: 0, user: '', password: '', dbname: '' }, // not needed for API test
        api_key: config.api_key,
        base_url: config.base_url,
        model: config.model
      };
      const res = await axios.post('/api/config/test_api', payload);
      setApiTestResult({status: 'success', message: res.data.message});
    } catch (e: any) {
      setApiTestResult({status: 'error', message: e.response?.data?.detail || e.message});
    } finally {
      setTestingApi(false);
    }
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1>环境与大模型配置</h1>

      <div style={{ marginTop: '2rem', display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <h3>数据库配置 (DWS)</h3>
          <div>
            <label>主机地址 (Host)</label>
            <input value={config.host} onChange={e => setConfig({...config, host: e.target.value})} placeholder="127.0.0.1" />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label>端口 (Port)</label>
              <input type="number" value={config.port} onChange={e => setConfig({...config, port: parseInt(e.target.value)})} placeholder="8000" />
            </div>
            <div style={{ flex: 1 }}>
              <label>数据库名 (DB Name)</label>
              <input value={config.dbname} onChange={e => setConfig({...config, dbname: e.target.value})} placeholder="postgres" />
            </div>
          </div>
          <div>
            <label>用户名 (User)</label>
            <input value={config.user} onChange={e => setConfig({...config, user: e.target.value})} placeholder="dbadmin" />
          </div>
          <div>
            <label>密码 (Password)</label>
            <input type="password" value={config.password} onChange={e => setConfig({...config, password: e.target.value})} placeholder="******" />
          </div>
        </div>

        <div>
          <h3>DeepSeek 大模型配置</h3>
          <div>
            <label>API Key</label>
            <input type="password" value={config.api_key} onChange={e => setConfig({...config, api_key: e.target.value})} placeholder="sk-..." />
          </div>
          <div>
            <label>Base URL</label>
            <input value={config.base_url} onChange={e => setConfig({...config, base_url: e.target.value})} placeholder="https://api.deepseek.com/v1" />
          </div>
          <div>
            <label>Model</label>
            <input value={config.model} onChange={e => setConfig({...config, model: e.target.value})} placeholder="deepseek-v4-pro" />
          </div>
          <div style={{ marginTop: '1rem' }}>
            <button onClick={handleTestApi} disabled={testingApi} className="secondary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={16} /> 测试大模型连通性与 Agent 能力
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex-col">
        <button onClick={handleSave} style={{ alignSelf: 'flex-start' }}><Save size={18} /> 保存配置并连接</button>
        {status && <p style={{ color: status.includes('成功') ? 'var(--accent)' : 'var(--danger)' }}>{status}</p>}
      </div>

      <dialog ref={dialogRef} style={{ width: '80%', maxWidth: '800px' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: apiTestResult.status === 'success' ? 'var(--accent)' : (apiTestResult.status === 'error' ? 'var(--danger)' : 'white') }}>
          {apiTestResult.status === 'success' && <CheckCircle size={24} />}
          {apiTestResult.status === 'error' && <AlertTriangle size={24} />}
          API 测试诊断结果
        </h2>
        
        {testingApi ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            正在请求 API 网关，这可能需要长达十秒钟的时间，请耐心等待...
          </div>
        ) : (
          <pre style={{ 
            backgroundColor: 'rgba(0,0,0,0.5)', 
            padding: '1rem', 
            borderRadius: '8px', 
            overflowX: 'auto', 
            maxHeight: '400px',
            color: apiTestResult.status === 'error' ? '#fca5a5' : '#a78bfa',
            whiteSpace: 'pre-wrap'
          }}>
            {apiTestResult.message}
          </pre>
        )}
        
        <form method="dialog" className="mt-4" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="secondary" disabled={testingApi}>关闭</button>
        </form>
      </dialog>
    </div>
  );
};

export default ConfigPage;
