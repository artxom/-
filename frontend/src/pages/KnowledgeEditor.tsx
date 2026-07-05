import React, { useEffect, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { Save, X, ArrowLeft } from 'lucide-react';

interface KnowledgeEditorProps {
  initialContent: string;
  initialTarget?: string;
  onSave: (content: string, target: string) => Promise<void>;
  onCancel: () => void;
  title: string;
}

const KnowledgeEditor: React.FC<KnowledgeEditorProps> = ({ initialContent, initialTarget = '', onSave, onCancel, title }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [targetValue, setTargetValue] = useState(initialTarget);
  const editor = useCreateBlockNote();

  useEffect(() => {
    async function loadContent() {
      if (initialContent) {
        const blocks = await editor.tryParseMarkdownToBlocks(initialContent);
        editor.replaceBlocks(editor.document, blocks);
      }
    }
    loadContent();
  }, [editor, initialContent]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const markdown = await editor.blocksToMarkdownLossy(editor.document);
      await onSave(markdown, targetValue);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
          <button className="secondary icon-btn" onClick={onCancel} style={{ padding: '0.5rem', borderRadius: '50%', border: 'none', flexShrink: 0 }} title="返回列表">
            <ArrowLeft size={20} />
          </button>
          <h2 style={{ margin: 0, fontSize: '1.25rem', whiteSpace: 'nowrap' }}>{title}</h2>
          <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)', margin: '0 0.5rem' }}></div>
          <input 
            type="text" 
            value={targetValue} 
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="知识对象 (如：表名、字段名)..." 
            style={{ margin: 0, padding: '0.5rem 1rem', maxWidth: '300px', backgroundColor: 'transparent', flex: 1 }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="primary" onClick={handleSave} disabled={isSaving}>
            <Save size={18} />
            {isSaving ? '保存中...' : '保存'}
          </button>
          <button className="secondary" onClick={onCancel}>
            <X size={18} />
            取消
          </button>
        </div>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
        <BlockNoteView editor={editor} theme="dark" />
      </div>
    </div>
  );
};

export default KnowledgeEditor;
