
import React, { useState } from 'react';
import { Book, ChevronDown, ChevronRight, Download, Trash2, StickyNote, PenLine, Layers, Rocket } from 'lucide-react';
import { PageNotes, Note } from '../types';

interface NotebookProps {
  fileName: string | null;
  notes: PageNotes;
  onUpdateNote: (page: number, noteId: string, newText: string) => void;
  onDeleteNote: (page: number, noteId: string) => void;
}

type Tab = 'deep' | 'skim';

export const Notebook: React.FC<NotebookProps> = ({ fileName, notes, onUpdateNote, onDeleteNote }) => {
  // Collapsed state for each page group. Default to empty (all open)
  const [collapsedPages, setCollapsedPages] = useState<Record<number, boolean>>({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('deep');

  const togglePage = (page: number) => {
    setCollapsedPages(prev => ({
      ...prev,
      [page]: !prev[page]
    }));
  };

  const startEditing = (note: Note) => {
    setEditingNoteId(note.id);
    setEditText(note.text);
  };

  const saveEdit = (page: number, noteId: string) => {
    if (editText.trim()) {
      onUpdateNote(page, noteId, editText);
    }
    setEditingNoteId(null);
  };

  const pageNumbers = Object.keys(notes).map(Number).sort((a, b) => a - b);
  
  // Filtering logic
  const hasDeepNotes = pageNumbers.some(p => notes[p].some(n => !n.category || n.category === 'deep'));
  const hasSkimNotes = pageNumbers.some(p => notes[p].some(n => n.category === 'skim'));
  const hasAnyNotes = hasDeepNotes || hasSkimNotes;

  // --- Export Logic ---
  const handleExportDoc = () => {
    if (!hasAnyNotes) return;
    const title = fileName || '学习笔记';
    
    // Construct HTML content for Word
    let htmlBody = `<h1 style="font-size: 24px; color: #333;">${title} - 学习笔记</h1>`;
    
    // SECTION 1: Deep Notes
    if (hasDeepNotes) {
        htmlBody += `<h2 style="font-size: 20px; color: #e11d48; margin-top: 30px; border-bottom: 2px solid #e11d48;">第一部分：精读笔记 (Deep Dive)</h2>`;
        pageNumbers.forEach(page => {
            const pageNotes = notes[page].filter(n => !n.category || n.category === 'deep');
            if (pageNotes.length === 0) return;
            
            htmlBody += `<h3 style="font-size: 16px; color: #444; margin-top: 20px; background-color: #f5f5f4; padding: 5px;">第 ${page} 页</h3><ul>`;
            pageNotes.forEach(note => {
                htmlBody += `<li style="font-size: 14px; margin-bottom: 8px; color: #555;">${note.text}</li>`;
            });
            htmlBody += `</ul>`;
        });
    }

    // SECTION 2: Skim Notes
    if (hasSkimNotes) {
        htmlBody += `<h2 style="font-size: 20px; color: #4f46e5; margin-top: 30px; border-bottom: 2px solid #4f46e5;">第二部分：略读笔记 (Skim & Macro)</h2>`;
        // Flatten skim notes but keep page reference in text potentially?
        // Let's just list them by page or aggregate. Grouping by page is still useful context.
        pageNumbers.forEach(page => {
            const pageNotes = notes[page].filter(n => n.category === 'skim');
            if (pageNotes.length === 0) return;

             htmlBody += `<h3 style="font-size: 16px; color: #444; margin-top: 20px; background-color: #eef2ff; padding: 5px;">第 ${page} 页 (Context)</h3><ul>`;
            pageNotes.forEach(note => {
                htmlBody += `<li style="font-size: 14px; margin-bottom: 8px; color: #555;">${note.text}</li>`;
            });
            htmlBody += `</ul>`;
        });
    }

    const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Export HTML To Doc</title></head><body>";
    const postHtml = "</body></html>";
    const html = preHtml + htmlBody + postHtml;

    const url = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(html);
    const downloadLink = document.createElement("a");
    document.body.appendChild(downloadLink);
    downloadLink.href = url;
    downloadLink.download = `${title}.doc`;
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  if (!fileName) return null;

  return (
    <div className="w-full max-w-5xl mx-auto mb-24 px-4">
      <div className="bg-white rounded-[40px] shadow-xl border border-stone-100 overflow-hidden relative">
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full mix-blend-multiply filter blur-3xl opacity-50 -translate-y-1/4 translate-x-1/4 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-rose-50 rounded-full mix-blend-multiply filter blur-3xl opacity-40 translate-y-1/4 -translate-x-1/4 pointer-events-none"></div>
        
        {/* Header */}
        <div className="p-8 pb-4 border-b border-stone-50 flex items-center justify-between relative z-10">
          <div className="flex items-center space-x-4">
             <div className="bg-slate-800 p-3 rounded-2xl text-white shadow-lg shadow-slate-200">
                <Book className="w-7 h-7" />
             </div>
             <div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">我的学习手账</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-1">{fileName || '未命名文档'}</p>
             </div>
          </div>

          <button
            onClick={handleExportDoc}
            disabled={!hasAnyNotes}
            className="flex items-center space-x-2 bg-white border border-stone-200 text-slate-700 px-5 py-2.5 rounded-2xl hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm active:scale-95 group"
          >
            <Download className="w-4 h-4 text-slate-400 group-hover:text-slate-800" />
            <span className="text-sm font-bold">导出笔记</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-8 pt-4 flex space-x-2 relative z-10">
            <button
                onClick={() => setActiveTab('deep')}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-t-2xl font-bold text-sm transition-all border-t border-l border-r ${
                    activeTab === 'deep' 
                    ? 'bg-stone-50/50 border-stone-100 text-rose-600' 
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-600 hover:bg-stone-50/30'
                }`}
            >
                <Rocket className="w-4 h-4" />
                <span>精读笔记 (Deep)</span>
                {hasDeepNotes && <div className="w-1.5 h-1.5 rounded-full bg-rose-400 ml-1"></div>}
            </button>
            <button
                onClick={() => setActiveTab('skim')}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-t-2xl font-bold text-sm transition-all border-t border-l border-r ${
                    activeTab === 'skim' 
                    ? 'bg-stone-50/50 border-stone-100 text-indigo-600' 
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-600 hover:bg-stone-50/30'
                }`}
            >
                <Layers className="w-4 h-4" />
                <span>略读笔记 (Skim)</span>
                {hasSkimNotes && <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 ml-1"></div>}
            </button>
        </div>

        {/* Content */}
        <div className="p-8 bg-stone-50/50 min-h-[300px] relative z-10 border-t border-stone-100">
          {!hasAnyNotes ? (
            <div className="flex flex-col items-center justify-center h-64 text-stone-400 space-y-4 border-2 border-dashed border-stone-200 rounded-3xl bg-white/50">
               <div className="bg-white p-5 rounded-full shadow-sm">
                 <PenLine className="w-10 h-10 text-stone-300" />
               </div>
               <div className="text-center">
                   <p className="font-bold text-slate-500 text-lg">笔记本是空的</p>
                   <p className="text-sm mt-1">在 AI 讲解区选中文字<br/>点击“记笔记”即可收藏重点</p>
               </div>
            </div>
          ) : (
            <div className="space-y-6">
              {pageNumbers.map(page => {
                 // FILTER NOTES BASED ON TAB
                 const pageNotes = notes[page].filter(n => {
                     if (activeTab === 'deep') return !n.category || n.category === 'deep';
                     return n.category === 'skim';
                 });

                 if (pageNotes.length === 0) return null;
                 const isCollapsed = collapsedPages[page];

                 const accentColor = activeTab === 'deep' ? 'rose' : 'indigo';
                 const noteIconColor = activeTab === 'deep' ? 'text-rose-300' : 'text-indigo-300';
                 const noteIconFill = activeTab === 'deep' ? 'fill-rose-100' : 'fill-indigo-100';
                 const hoverBorder = activeTab === 'deep' ? 'hover:border-rose-100' : 'hover:border-indigo-100';
                 const hoverBg = activeTab === 'deep' ? 'hover:bg-rose-50/30' : 'hover:bg-indigo-50/30';

                 return (
                    <div key={page} className="bg-white border border-stone-100 rounded-[32px] overflow-hidden shadow-sm hover:shadow-lg hover:shadow-stone-100 transition-all duration-300">
                       {/* Page Header */}
                       <button 
                         onClick={() => togglePage(page)}
                         className="w-full flex items-center justify-between p-5 bg-white hover:bg-stone-50 transition-colors group"
                       >
                          <div className="flex items-center space-x-3 font-bold text-slate-700">
                             <div className={`p-1.5 rounded-full transition-colors ${isCollapsed ? 'bg-stone-100 text-stone-400' : `bg-${accentColor}-100 text-${accentColor}-500`}`}>
                                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                             </div>
                             <span className="text-lg">第 {page} 页</span>
                             <span className="text-xs bg-stone-100 text-stone-400 px-2.5 py-1 rounded-full font-mono">{pageNotes.length} 条笔记</span>
                          </div>
                       </button>

                       {/* Notes List */}
                       {!isCollapsed && (
                         <div className="px-5 pb-5 space-y-3">
                            {pageNotes.map(note => (
                                <div key={note.id} className={`group relative flex items-start space-x-4 p-4 rounded-2xl bg-stone-50/80 border border-transparent ${hoverBorder} ${hoverBg} transition-all`}>
                                    <div className={`mt-1 flex-shrink-0 ${noteIconColor}`}>
                                        <StickyNote className={`w-5 h-5 ${noteIconFill}`} />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        {editingNoteId === note.id ? (
                                            <div className="flex flex-col space-y-2 animate-in fade-in">
                                                <textarea 
                                                    value={editText}
                                                    onChange={(e) => setEditText(e.target.value)}
                                                    className={`w-full p-3 rounded-xl border-2 border-${accentColor}-200 focus:border-${accentColor}-400 focus:ring-0 text-sm bg-white text-slate-700`}
                                                    rows={3}
                                                    autoFocus
                                                />
                                                <div className="flex justify-end space-x-2">
                                                    <button onClick={() => setEditingNoteId(null)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-stone-100 rounded-lg">取消</button>
                                                    <button onClick={() => saveEdit(page, note.id)} className={`px-3 py-1.5 text-xs font-bold text-white bg-${accentColor}-500 hover:bg-${accentColor}-600 rounded-lg shadow-sm`}>保存</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div 
                                                className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap cursor-text hover:text-slate-900 transition-colors"
                                                onClick={() => startEditing(note)}
                                                title="点击编辑"
                                            >
                                                {note.text}
                                            </div>
                                        )}
                                        <div className="mt-2 text-[10px] text-stone-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                            {new Date(note.createdAt).toLocaleString()}
                                        </div>
                                    </div>

                                    {editingNoteId !== note.id && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onDeleteNote(page, note.id); }}
                                            className="opacity-0 group-hover:opacity-100 p-2 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all absolute top-2 right-2"
                                            title="删除笔记"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                         </div>
                       )}
                    </div>
                 )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
