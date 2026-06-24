import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { DatabaseZap, ChevronLeft, ChevronRight } from 'lucide-react';

const DiamondIcon = ({ char, active }: { char: string, active: boolean }) => (
  <div style={{
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexShrink: 0,
  }}>
    <div style={{
      position: 'absolute',
      width: '100%',
      height: '100%',
      backgroundColor: active ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
      transform: 'rotate(45deg)',
      borderRadius: '8px', // rounded diamond
      transition: 'all 0.3s ease',
      boxShadow: active ? '0 0 15px rgba(59, 130, 246, 0.4)' : 'none',
    }} />
    <span style={{ 
      position: 'relative',
      fontSize: '1.25rem', 
      fontWeight: 'bold', 
      color: active ? 'white' : 'var(--text-muted)',
      zIndex: 1,
      textShadow: active ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'
    }}>{char}</span>
  </div>
);

const Layout = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { path: '/config', char: '符', label: '环境配置' },
    { path: '/basic', char: '篡', label: '数据修改' },
    { path: '/agent', char: '策', label: '智能造数' },
    { path: '/knowledge', char: '籍', label: '知识管理' },
    { path: '/analytics', char: '筹', label: '用量统计' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <aside 
        className="glass-panel" 
        style={{ 
          width: isCollapsed ? '100px' : '280px', 
          margin: '1.5rem', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '2rem',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          padding: '1.5rem'
        }}
      >
        {/* Toggle Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            position: 'absolute',
            right: '-15px',
            top: '2.5rem',
            width: '30px',
            height: '30px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            padding: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Logo Section */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1rem',
          paddingBottom: '1.5rem', 
          borderBottom: '1px solid var(--border)',
          overflow: 'hidden',
          whiteSpace: 'nowrap'
        }}>
          <DatabaseZap color="var(--primary)" size={38} style={{ flexShrink: 0 }} />
          <h1 style={{ 
            margin: 0, 
            fontSize: '2.2rem', 
            fontWeight: '900', 
            background: 'linear-gradient(135deg, #60a5fa, #a78bfa)', 
            WebkitBackgroundClip: 'text', 
            WebkitTextFillColor: 'transparent',
            letterSpacing: '2px',
            opacity: isCollapsed ? 0 : 1,
            maxWidth: isCollapsed ? '0px' : '200px',
            transition: 'all 0.3s ease'
          }}>
            莫知其味
          </h1>
        </div>
        
        {/* Navigation */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', flex: 1 }}>
          {navItems.map(item => (
            <NavLink 
              key={item.path}
              to={item.path} 
              style={({ isActive }) => ({
                padding: '0.8rem', 
                borderRadius: '12px', 
                textDecoration: 'none',
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                display: 'flex', 
                alignItems: 'center', 
                gap: '1.5rem', // increased gap between icon and text
                transition: 'all 0.2s ease',
                overflow: 'hidden'
              })}
            >
              {({ isActive }) => (
                <>
                  <DiamondIcon char={item.char} active={isActive} />
                  <span style={{ 
                    fontSize: '1.1rem', // increased font size for the 4 characters
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? 'white' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    opacity: isCollapsed ? 0 : 1,
                    maxWidth: isCollapsed ? '0px' : '200px',
                    transition: 'all 0.3s ease'
                  }}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '1.5rem 1.5rem 1.5rem 0', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
