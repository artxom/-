import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, Calendar, Clock, Loader2, Zap } from 'lucide-react';

interface HourlyStat {
  label: string;
  sessions: number;
  tokens: number;
}

interface DailyStat {
  date: string;
  sessions: number;
  tokens: number;
}

const AnalyticsPage = () => {
  const [todayStats, setTodayStats] = useState<HourlyStat[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await axios.get('/api/analytics');
        setTodayStats(res.data.data.today || []);
        setDailyStats(res.data.data.daily || []);
      } catch (e) {
        console.error("Failed to fetch analytics", e);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
  }, []);

  const maxTokensToday = Math.max(...todayStats.map(s => s.tokens), 1);
  const maxSessionsToday = Math.max(...todayStats.map(s => s.sessions), 1);

  return (
    <div className="animate-fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
      <div className="flex-row">
        <Activity size={28} color="var(--primary)" />
        <h1 style={{ margin: 0, marginLeft: '0.5rem' }}>数据统计看板</h1>
      </div>
      
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : (
        <>
          <section className="glass-panel" style={{ padding: '2rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
              <Clock size={20} color="var(--accent)" /> 今日实时监控 (3小时区间)
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              {todayStats.map((stat, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '100px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {stat.label}
                  </div>
                  
                  {/* Token Bar */}
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ 
                      height: '12px', 
                      borderRadius: '6px', 
                      backgroundColor: 'rgba(59, 130, 246, 0.5)',
                      width: `${(stat.tokens / maxTokensToday) * 100}%`,
                      transition: 'width 0.5s ease-out',
                      minWidth: stat.tokens > 0 ? '4px' : '0'
                    }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>
                      {stat.tokens > 0 && <><Zap size={10} style={{ display: 'inline', verticalAlign: 'middle' }}/> {stat.tokens}</>}
                    </span>
                  </div>

                  {/* Session Bar */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ 
                      height: '12px', 
                      borderRadius: '6px', 
                      backgroundColor: 'rgba(16, 185, 129, 0.5)',
                      width: `${(stat.sessions / maxSessionsToday) * 100}%`,
                      transition: 'width 0.5s ease-out',
                      minWidth: stat.sessions > 0 ? '4px' : '0'
                    }} />
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>
                      {stat.sessions > 0 && `${stat.sessions} 次`}
                    </span>
                  </div>
                </div>
              ))}
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: 'rgba(59, 130, 246, 0.5)', borderRadius: '2px' }}></span> Token 消耗</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: 'rgba(16, 185, 129, 0.5)', borderRadius: '2px' }}></span> 会话次数</span>
              </div>
            </div>
          </section>

          <section className="glass-panel" style={{ padding: '2rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0, marginBottom: '1.5rem' }}>
              <Calendar size={20} color="var(--primary)" /> 历史每日趋势
            </h3>
            
            {dailyStats.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>暂无历史数据</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '1rem 0.5rem' }}>日期</th>
                    <th style={{ padding: '1rem 0.5rem' }}>发起会话次数</th>
                    <th style={{ padding: '1rem 0.5rem' }}>Token 总消耗</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyStats.map((stat, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '1rem 0.5rem', fontWeight: 'bold' }}>{stat.date}</td>
                      <td style={{ padding: '1rem 0.5rem', color: 'var(--accent)' }}>{stat.sessions} 次</td>
                      <td style={{ padding: '1rem 0.5rem', color: 'var(--primary)' }}>
                        <Zap size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                        {stat.tokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};

export default AnalyticsPage;
