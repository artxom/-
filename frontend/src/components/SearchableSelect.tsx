import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export const SearchableSelect = ({ options, value, onChange, placeholder, style, disabled }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredOptions = options.filter((o: string) => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ padding: '0.5rem', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: value ? 'white' : 'var(--text-muted)', cursor: 'pointer', minHeight: '38px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>{value || placeholder}</span>
        <ChevronDown size={14} />
      </div>
      {isOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, backgroundColor: 'var(--bg-card)', backdropFilter: 'blur(10px)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px' }}>
          <input 
            type="text" 
            placeholder="搜索..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', width: '100%' }}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
            {filteredOptions.length > 0 ? filteredOptions.map((o: string) => (
              <div 
                key={o} 
                onClick={() => { onChange(o); setIsOpen(false); setSearch(''); }}
                style={{ padding: '0.4rem', cursor: 'pointer', borderRadius: '4px', backgroundColor: value === o ? 'var(--primary)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = value === o ? 'var(--primary)' : 'rgba(255,255,255,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = value === o ? 'var(--primary)' : 'transparent')}
              >
                {o}
              </div>
            )) : <div style={{ padding: '0.4rem', color: 'var(--text-muted)' }}>无匹配结果</div>}
          </div>
        </div>
      )}
    </div>
  );
};
