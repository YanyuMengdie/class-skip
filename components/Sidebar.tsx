
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LayoutGrid, Cloud, FileText, Loader2, LogIn, Trash2, Edit2, Check, X, FolderPlus, Folder, FolderOpen, MoreHorizontal, Plus, CornerDownRight, Calendar as CalendarIcon, PenTool, ChevronLeft, ChevronRight, Clock, MapPin, CheckCircle2, BookOpen, Layers, Star, Filter, Lightbulb, Target, AlertTriangle, Flame, Sparkles } from 'lucide-react';
import { User } from 'firebase/auth';
import { getUserSessions, renameCloudSession, moveSession, createCloudFolder, addCalendarEvent, getCalendarEvents, deleteCalendarEvent, addMemo, getMemos, deleteMemo } from '../services/firebase';
import { CloudSession, CalendarEvent, Memo, PageMarks, MarkType } from '../types';

interface SidebarProps {
  isOpen: boolean;
  totalPages: number;
  currentPage: number;
  onJumpToPage: (page: number) => void;

  /** 已上传 PDF 时显示「复习」入口 */
  hasPdfLoaded?: boolean;
  onOpenQuiz?: () => void;
  onOpenFlashCard?: () => void;
  
  /** 页面标记数据 */
  pageMarks?: PageMarks;
  fileName?: string | null;
  
  // Cloud Props
  user: User | null;
  onLogin: () => void;
  onRestoreSession: (session: CloudSession) => void;
  onDeleteSession?: (session: CloudSession) => Promise<boolean>;
}

type Tab = 'pages' | 'cloud' | 'calendar' | 'memo';

// --- ONE NOTE STYLE UTILS ---
const SECTION_COLORS = [
  'border-l-rose-400 bg-rose-50/50 hover:bg-rose-100/50', 
  'border-l-orange-400 bg-orange-50/50 hover:bg-orange-100/50', 
  'border-l-amber-400 bg-amber-50/50 hover:bg-amber-100/50', 
  'border-l-emerald-400 bg-emerald-50/50 hover:bg-emerald-100/50', 
  'border-l-cyan-400 bg-cyan-50/50 hover:bg-cyan-100/50', 
  'border-l-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/50', 
  'border-l-violet-400 bg-violet-50/50 hover:bg-violet-100/50', 
  'border-l-fuchsia-400 bg-fuchsia-50/50 hover:bg-fuchsia-100/50'
];

const getFolderStyle = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return SECTION_COLORS[Math.abs(hash) % SECTION_COLORS.length];
};

// --- UTILITY: TREE BUILDER (FIXED) ---
const buildFileTree = (flatList: CloudSession[]): CloudSession[] => {
    const map: Record<string, CloudSession> = {};
    const roots: CloudSession[] = [];

    // 1. Initialize map & Sanitize Data
    flatList.forEach(item => {
        const safeItem: CloudSession = {
            ...item,
            type: item.type || 'file',
            parentId: item.parentId || null,
            children: [] 
        };
        map[safeItem.id] = safeItem;
    });

    // 2. Link children to parents (With Type Check!)
    Object.values(map).forEach(item => {
        if (item.parentId && map[item.parentId]) {
            const parent = map[item.parentId];
            if (parent.type === 'folder') {
                parent.children?.push(item);
            } else {
                // Rescue orphaned files
                roots.push(item);
            }
        } else {
            roots.push(item);
        }
    });

    // 3. Sort each level
    const sortNodes = (nodes: CloudSession[]) => {
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1; 
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0); 
        });
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                sortNodes(node.children);
            }
        });
    };

    sortNodes(roots);
    return roots;
};

// --- COMPONENT: FILE TREE ITEM (RECURSIVE) ---
interface FileTreeItemProps {
    node: CloudSession;
    level: number;
    onToggle: (id: string) => void;
    isExpanded: boolean;
    onSelect: (node: CloudSession) => void;
    onRename: (node: CloudSession) => void;
    onDelete: (node: CloudSession) => void;
    onDropMove: (draggedId: string, targetId: string | null) => void;
    onCreateSubFolder: (parentId: string) => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ 
    node, 
    level, 
    onToggle, 
    isExpanded, 
    onSelect,
    onRename,
    onDelete,
    onDropMove,
    onCreateSubFolder
}) => {
    const [isDragOver, setIsDragOver] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    
    // OneNote Style Logic
    const isFolder = node.type === 'folder';
    const folderStyle = isFolder ? getFolderStyle(node.id) : '';
    const indentPixel = level * 12;

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ id: node.id, type: node.type }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (!isFolder) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;
        const { id: draggedId } = JSON.parse(data);
        if (draggedId === node.id) return;
        if (isFolder) {
            onDropMove(draggedId, node.id);
            if (!isExpanded) onToggle(node.id);
        }
    };

    return (
        <div className="select-none mb-0.5">
            <div 
                className={`
                    relative flex items-center justify-between group transition-all cursor-pointer
                    ${isFolder 
                        ? `py-2 pr-2 border-l-4 rounded-r-lg mb-1 ${folderStyle} ${isDragOver ? 'ring-2 ring-indigo-400 bg-indigo-50' : ''}` 
                        : `py-1.5 pr-2 hover:bg-stone-100 rounded-lg ml-3 border-l-2 border-transparent hover:border-stone-200`}
                `}
                style={{ marginLeft: isFolder ? `${indentPixel}px` : `${indentPixel + 8}px` }}
                draggable
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={e => { e.preventDefault(); setIsDragOver(false); }}
                onDrop={handleDrop}
                onClick={(e) => {
                    e.stopPropagation();
                    if (isFolder) onToggle(node.id);
                    else onSelect(node);
                }}
            >
                <div className="flex items-center space-x-2 min-w-0 flex-1 pl-2">
                    <div className={`shrink-0 ${isFolder ? 'text-slate-600' : 'text-stone-400'}`}>
                        {isFolder ? (isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />) : (<FileText className="w-3.5 h-3.5" />)}
                    </div>
                    <span className={`text-sm truncate ${isFolder ? 'font-bold text-slate-700' : 'font-medium text-slate-600'}`}>
                        {node.customTitle || node.fileName}
                    </span>
                </div>
                <div className="relative" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => setShowMenu(!showMenu)}
                        className={`p-1 rounded text-stone-400 hover:text-slate-700 hover:bg-black/5 transition-opacity ${showMenu ? 'opacity-100 bg-black/5' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </button>
                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)}></div>
                            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-xl shadow-xl border border-stone-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                {isFolder && (
                                    <button onClick={() => { setShowMenu(false); onCreateSubFolder(node.id); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 border-b border-stone-50">
                                        <Plus className="w-3.5 h-3.5" /> 新建子文件夹
                                    </button>
                                )}
                                <button onClick={() => { setShowMenu(false); onRename(node); }} className="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 hover:bg-stone-50 flex items-center gap-2">
                                    <Edit2 className="w-3.5 h-3.5" /> 重命名
                                </button>
                                <button onClick={() => { setShowMenu(false); onDelete(node); }} className="w-full text-left px-4 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 flex items-center gap-2">
                                    <Trash2 className="w-3.5 h-3.5" /> 删除
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {isFolder && isExpanded && node.children && (
                <div className="mt-0.5">
                    {node.children.length > 0 ? (
                        node.children.map(child => (
                            <FileTreeItem 
                                key={child.id} node={child} level={level + 1}
                                isExpanded={isExpanded} onToggle={onToggle} onSelect={onSelect}
                                onRename={onRename} onDelete={onDelete} onDropMove={onDropMove}
                                onCreateSubFolder={onCreateSubFolder} {...{isExpanded: false}}
                            />
                        ))
                    ) : (
                        <div className="py-1 pl-4 text-[10px] text-stone-300 italic flex items-center" style={{ marginLeft: `${indentPixel + 8}px` }}>
                            <CornerDownRight className="w-3 h-3 mr-1 opacity-50" /> 空分区
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


const MARK_TYPE_CONFIG: Record<MarkType, { icon: React.ReactNode; color: string; label: string }> = {
  core: { icon: <Lightbulb className="w-3 h-3" />, color: 'text-blue-600', label: '核心概念' },
  formula: { icon: <FileText className="w-3 h-3" />, color: 'text-purple-600', label: '公式定理' },
  example: { icon: <Target className="w-3 h-3" />, color: 'text-green-600', label: '例题案例' },
  trap: { icon: <AlertTriangle className="w-3 h-3" />, color: 'text-orange-600', label: '易错点' },
  exam: { icon: <Star className="w-3 h-3" />, color: 'text-red-600', label: '考试重点' },
  difficult: { icon: <Flame className="w-3 h-3" />, color: 'text-rose-600', label: '难点' },
  summary: { icon: <Sparkles className="w-3 h-3" />, color: 'text-amber-600', label: '总结要点' },
  custom: { icon: <Star className="w-3 h-3" />, color: 'text-slate-600', label: '自定义' },
};

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  totalPages,
  currentPage,
  onJumpToPage,
  hasPdfLoaded,
  onOpenQuiz,
  onOpenFlashCard,
  pageMarks,
  fileName,
  user,
  onLogin,
  onRestoreSession,
  onDeleteSession
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('pages');
  const [sessions, setSessions] = useState<CloudSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Cloud Tree State
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [creatingParentId, setCreatingParentId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // --- CALENDAR STATES (Cloud Synced) ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string>(new Date().toISOString().split('T')[0]);
  const [events, setEvents] = useState<CalendarEvent[]>([]); // No mock data
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);

  // --- MEMO STATES (Cloud Synced) ---
  const [memos, setMemos] = useState<Memo[]>([]); // No mock data
  const [memoInput, setMemoInput] = useState('');
  const [isLoadingMemos, setIsLoadingMemos] = useState(false);

  // --- PAGE MARK FILTER STATE ---
  const [markFilter, setMarkFilter] = useState<MarkType | 'all' | 'priority-high'>('all');

  // --- DATA SYNC EFFECT ---
  useEffect(() => {
    if (user) {
        // Load all cloud data
        if (activeTab === 'cloud') refreshSessions();
        if (activeTab === 'calendar') loadCalendar();
        if (activeTab === 'memo') loadMemos();
    } else {
        // Reset local data if logged out
        setSessions([]);
        setEvents([]);
        setMemos([]);
    }
  }, [user, activeTab]);

  useEffect(() => {
      if (isCreatingFolder && inputRef.current) inputRef.current.focus();
  }, [isCreatingFolder]);

  // --- CLOUD SESSIONS LOGIC ---
  const refreshSessions = () => {
      setLoadingSessions(true);
      getUserSessions(user!)
        .then(setSessions)
        .finally(() => setLoadingSessions(false));
  };
  const fileTree = useMemo(() => buildFileTree(sessions), [sessions]);
  const handleToggleFolder = (id: string) => {
      const newSet = new Set(expandedIds);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      setExpandedIds(newSet);
  };
  const handleInitiateCreateFolder = (parentId: string | null) => {
      setCreatingParentId(parentId); setIsCreatingFolder(true); setNewFolderName('');
  };
  const handleCreateFolder = async () => {
      if (!newFolderName.trim() || !user) return;
      try {
          await createCloudFolder(user, newFolderName.trim(), creatingParentId);
          refreshSessions();
          if (creatingParentId) setExpandedIds(prev => new Set(prev).add(creatingParentId));
          setNewFolderName(''); setIsCreatingFolder(false); setCreatingParentId(null);
      } catch (e) { alert("创建失败"); }
  };
  const submitRename = async () => {
      if (!renamingId || !renameValue.trim()) return;
      setSessions(prev => prev.map(s => s.id === renamingId ? { ...s, customTitle: renameValue } : s));
      try { await renameCloudSession(renamingId, renameValue); } catch (e) {} 
      finally { setRenamingId(null); setRenameValue(''); }
  };
  const handleDelete = async (node: CloudSession) => {
      if (!window.confirm(`确定删除?`)) return;
      if (onDeleteSession) {
          const success = await onDeleteSession(node);
          if (success) setSessions(prev => prev.filter(s => s.id !== node.id));
      }
  };
  const handleDropMove = async (draggedId: string, targetId: string | null) => {
      setSessions(prev => prev.map(s => s.id === draggedId ? { ...s, parentId: targetId } : s));
      try { await moveSession(draggedId, targetId); } catch (e) { refreshSessions(); }
  };
  const handleRootDrop = (e: React.DragEvent) => {
      e.preventDefault(); const data = e.dataTransfer.getData('application/json'); if (!data) return;
      const { id } = JSON.parse(data); handleDropMove(id, null);
  };

  // --- CALENDAR LOGIC (CLOUD) ---
  const loadCalendar = () => {
      if(!user) return;
      setIsLoadingCalendar(true);
      getCalendarEvents(user)
        .then(setEvents)
        .finally(() => setIsLoadingCalendar(false));
  };

  const getDaysInMonth = (date: Date) => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
      return { daysInMonth, firstDay };
  };
  
  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const handleDateClick = (day: number) => {
      const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const offset = newDate.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(newDate.getTime() - offset)).toISOString().slice(0, 10);
      setSelectedDateStr(localISOTime);
  };
  
  const handleInitiateAddEvent = () => {
      if (!user) { alert("请先登录同步日历"); return; }
      setIsAddingEvent(true);
      setNewEventTitle('');
  };

  const submitNewEvent = async () => {
      if (!newEventTitle.trim() || !user) return;
      try {
          const newEventData = {
              title: newEventTitle,
              startTime: '09:00', // Default
              endTime: '10:00',
              type: 'study' as const,
              dateStr: selectedDateStr
          };
          // Optimistic update
          const tempId = 'temp-' + Date.now();
          setEvents(prev => [...prev, { id: tempId, userId: user.uid, ...newEventData }]);
          
          const createdEvent = await addCalendarEvent(user, newEventData);
          setEvents(prev => prev.map(e => e.id === tempId ? createdEvent : e));
          
          setIsAddingEvent(false);
          setNewEventTitle('');
      } catch (e) {
          console.error(e);
          alert("添加失败");
          loadCalendar(); // Revert on fail
      }
  };

  const handleDeleteEvent = async (eventId: string) => {
      if (!user) return;
      setEvents(prev => prev.filter(e => e.id !== eventId)); // Optimistic
      try {
          await deleteCalendarEvent(user.uid, eventId);
      } catch (e) {
          console.error(e);
          alert("删除失败");
          loadCalendar();
      }
  };

  // --- MEMO LOGIC (CLOUD) ---
  const loadMemos = () => {
      if(!user) return;
      setIsLoadingMemos(true);
      getMemos(user)
        .then(setMemos)
        .finally(() => setIsLoadingMemos(false));
  };

  const handleAddMemo = async () => {
      if (!memoInput.trim() || !user) {
          if(!user) alert("请先登录使用便签");
          return;
      }
      try {
          const content = memoInput;
          setMemoInput(''); // Clear input immediately
          
          const newMemo = await addMemo(user, content);
          setMemos(prev => [newMemo, ...prev]);
      } catch (e) {
          console.error(e);
          alert("添加便签失败");
      }
  };

  const handleDeleteMemo = async (id: string) => {
      if (!user) return;
      setMemos(prev => prev.filter(m => m.id !== id)); // Optimistic
      try {
          await deleteMemo(user.uid, id);
      } catch (e) {
          console.error(e);
          alert("删除失败");
          loadMemos();
      }
  };

  const getParentName = () => {
      if (!creatingParentId) return "根目录";
      const parent = sessions.find(s => s.id === creatingParentId);
      return parent ? (parent.customTitle || parent.fileName) : "未知目录";
  };

  const renderTree = (nodes: CloudSession[], level = 0) => {
      return nodes.map(node => (
          <FileTreeItem 
            key={node.id} node={node} level={level}
            isExpanded={expandedIds.has(node.id)} onToggle={handleToggleFolder}
            onSelect={onRestoreSession} onRename={node => { setRenamingId(node.id); setRenameValue(node.customTitle || node.fileName); }}
            onDelete={handleDelete} onDropMove={handleDropMove} onCreateSubFolder={handleInitiateCreateFolder}
          />
      ));
  };

  if (!isOpen) return null;

  return (
    <div className="w-[320px] bg-[#F9F9F9] border-r border-stone-200 flex flex-col h-full shrink-0 z-40 animate-in slide-in-from-left-4 duration-200 shadow-xl shadow-stone-200/50">
      
      {/* 1. New Navigation Bar (Flex Based) */}
      <div className="p-2 border-b border-stone-200 bg-white flex items-center justify-between gap-1">
          {[
              { id: 'pages', icon: LayoutGrid, label: '页面' },
              { id: 'cloud', icon: Cloud, label: '云端' },
              { id: 'calendar', icon: CalendarIcon, label: '日历' },
              { id: 'memo', icon: PenTool, label: '便签' },
          ].map((tab) => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all min-w-0 ${
                    activeTab === tab.id 
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                    : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
                }`}
                title={tab.label}
              >
                  <tab.icon className="w-5 h-5 mb-0.5 shrink-0" />
                  <span className="text-[10px] font-bold truncate">{tab.label}</span>
              </button>
          ))}
      </div>

      {/* 2. Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar relative bg-[#F9F9F9]"
           onDragOver={(e) => { e.preventDefault(); }} 
           onDrop={handleRootDrop}
      >
          {/* --- TAB: PAGES --- */}
          {activeTab === 'pages' && (
              <div className="p-3 flex flex-col gap-4">
                {totalPages === 0 ? (
                    <div className="flex flex-col items-center justify-center mt-20 text-stone-300 space-y-3">
                        <FileText className="w-12 h-12 opacity-20" />
                        <p className="text-sm font-medium">暂无页面</p>
                    </div>
                ) : (
                    <>
                    {/* 筛选栏 */}
                    {pageMarks && fileName && pageMarks[fileName] && Object.keys(pageMarks[fileName]).length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1">
                                    <Filter className="w-3 h-3" /> 筛选标记
                                </p>
                                <button
                                    onClick={() => setMarkFilter('all')}
                                    className={`text-[10px] px-2 py-0.5 rounded ${markFilter === 'all' ? 'bg-indigo-100 text-indigo-600 font-bold' : 'text-stone-400 hover:text-stone-600'}`}
                                >
                                    全部
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                <button
                                    onClick={() => setMarkFilter(markFilter === 'priority-high' ? 'all' : 'priority-high')}
                                    className={`text-[10px] px-2 py-1 rounded border transition-all ${
                                        markFilter === 'priority-high' 
                                            ? 'bg-red-50 text-red-600 border-red-200 font-bold' 
                                            : 'bg-stone-50 text-stone-500 border-stone-200'
                                    }`}
                                >
                                    高优先级
                                </button>
                                {(Object.keys(MARK_TYPE_CONFIG) as MarkType[]).map(type => {
                                    const fileMarks = pageMarks[fileName] || {};
                                    const hasType = Object.values(fileMarks).some(marks => 
                                        marks.some(m => m.types.includes(type))
                                    );
                                    if (!hasType) return null;
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => setMarkFilter(markFilter === type ? 'all' : type)}
                                            className={`text-[10px] px-2 py-1 rounded border transition-all flex items-center gap-1 ${
                                                markFilter === type 
                                                    ? `${MARK_TYPE_CONFIG[type].color} bg-current/10 border-current font-bold` 
                                                    : 'bg-stone-50 text-stone-500 border-stone-200'
                                            }`}
                                        >
                                            {MARK_TYPE_CONFIG[type].icon}
                                            <span>{MARK_TYPE_CONFIG[type].label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 标记页分组（如果有标记） */}
                    {pageMarks && fileName && pageMarks[fileName] && Object.keys(pageMarks[fileName]).length > 0 && markFilter !== 'all' && (
                        <div className="space-y-2">
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">标记页</p>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.keys(pageMarks[fileName])
                                    .map(Number)
                                    .filter(pageNum => {
                                        const marks = pageMarks[fileName][pageNum] || [];
                                        if (markFilter === 'priority-high') {
                                            return marks.some(m => m.priority === 'high');
                                        }
                                        return marks.some(m => m.types.includes(markFilter as MarkType));
                                    })
                                    .map(pageNum => {
                                        const marks = pageMarks[fileName][pageNum] || [];
                                        const isActive = pageNum === currentPage;
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => onJumpToPage(pageNum - 1)}
                                                className={`relative aspect-[3/4] rounded-lg border-2 flex flex-col items-center justify-center text-sm font-bold transition-all ${
                                                    isActive 
                                                        ? 'border-slate-800 bg-slate-800 text-white shadow-md scale-105 z-10' 
                                                        : 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400'
                                                }`}
                                            >
                                                <span>{pageNum}</span>
                                                <div className="absolute top-1 right-1 flex flex-wrap gap-0.5">
                                                    {marks.slice(0, 3).map((mark, idx) => 
                                                        mark.types.slice(0, 2).map((type, tIdx) => (
                                                            <div key={`${mark.id}-${tIdx}`} className={`${MARK_TYPE_CONFIG[type]?.color || 'text-stone-400'}`}>
                                                                {MARK_TYPE_CONFIG[type]?.icon || <Star className="w-2.5 h-2.5" />}
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        </div>
                    )}

                    {/* 所有页面 */}
                    <div className="space-y-2">
                        {markFilter === 'all' && (
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">所有页面</p>
                        )}
                        <div className="grid grid-cols-3 gap-2 p-1">
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(page => {
                                    if (markFilter === 'all') return true;
                                    if (!pageMarks || !fileName || !pageMarks[fileName]) return true;
                                    const marks = pageMarks[fileName][page] || [];
                                    if (markFilter === 'priority-high') {
                                        return marks.some(m => m.priority === 'high');
                                    }
                                    return marks.some(m => m.types.includes(markFilter as MarkType));
                                })
                                .map((page) => {
                                const isActive = page === currentPage;
                                const marks = pageMarks && fileName && pageMarks[fileName] ? (pageMarks[fileName][page] || []) : [];
                                const hasMark = marks.length > 0;
                                return (
                                    <button
                                        key={page}
                                        onClick={() => onJumpToPage(page - 1)}
                                        className={`relative aspect-[3/4] rounded-lg border flex items-center justify-center text-sm font-bold transition-all ${
                                            isActive 
                                                ? 'border-slate-800 bg-slate-800 text-white shadow-md scale-105 z-10' 
                                                : hasMark 
                                                    ? 'border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400' 
                                                    : 'border-stone-200 bg-white text-stone-400 hover:border-stone-300 hover:text-stone-600'
                                        }`}
                                    >
                                        <span>{page}</span>
                                        {hasMark && (
                                            <div className="absolute top-1 right-1 flex flex-wrap gap-0.5">
                                                {marks.slice(0, 3).map((mark, idx) => 
                                                    mark.types.slice(0, 2).map((type, tIdx) => (
                                                        <div key={`${mark.id}-${tIdx}`} className={`${MARK_TYPE_CONFIG[type]?.color || 'text-stone-400'}`}>
                                                            {MARK_TYPE_CONFIG[type]?.icon || <Star className="w-2.5 h-2.5" />}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {hasPdfLoaded && (onOpenQuiz || onOpenFlashCard) && (
                        <div className="border-t border-stone-200 pt-3 mt-2">
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">复习</p>
                            <div className="flex flex-col gap-2">
                                {onOpenQuiz && (
                                    <button onClick={onOpenQuiz} className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-violet-50 border border-violet-100 text-violet-700 rounded-xl text-xs font-bold hover:bg-violet-100 transition-colors">
                                        <BookOpen className="w-4 h-4" /> Quiz
                                    </button>
                                )}
                                {onOpenFlashCard && (
                                    <button onClick={onOpenFlashCard} className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors">
                                        <Layers className="w-4 h-4" /> Flash Card
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    </>
                )}
              </div>
          )}

          {/* --- TAB: CLOUD --- */}
          {activeTab === 'cloud' && (
              <div className="space-y-3 h-full flex flex-col p-3">
                  {user && (
                      <div className="sticky top-0 z-20 bg-[#F9F9F9] pb-2 border-b border-stone-200 mb-2">
                          {isCreatingFolder ? (
                              <div className="animate-in slide-in-from-top-2 p-2 bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm">
                                  <div className="text-[10px] font-bold text-indigo-400 mb-1 flex items-center gap-1">
                                      <FolderPlus className="w-3 h-3" /> 正在创建于: {getParentName()}
                                  </div>
                                  <div className="flex items-center space-x-1">
                                      <input ref={inputRef} type="text" placeholder="分区名称..." value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="text-xs border border-indigo-200 rounded-lg px-2 py-1.5 flex-1 focus:ring-1 focus:ring-indigo-500 outline-none bg-white" onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setIsCreatingFolder(false); setCreatingParentId(null); } }} />
                                      <button onClick={handleCreateFolder} className="p-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 shadow-sm"><Check className="w-3 h-3" /></button>
                                      <button onClick={() => { setIsCreatingFolder(false); setCreatingParentId(null); }} className="p-1.5 text-stone-400 hover:bg-stone-200 rounded-lg"><X className="w-3 h-3" /></button>
                                  </div>
                              </div>
                          ) : (
                              <button onClick={() => handleInitiateCreateFolder(null)} className="w-full text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors border border-dashed border-stone-300 hover:border-indigo-200">
                                  <FolderPlus className="w-4 h-4" /> <span>新建分区组 (Root)</span>
                              </button>
                          )}
                      </div>
                  )}

                  {/* Rename Modal Logic inside Cloud Tab */}
                  {renamingId && (
                      <div className="absolute top-10 left-2 right-2 z-50 bg-white p-3 rounded-xl shadow-xl border border-indigo-100 animate-in slide-in-from-top-2 flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-indigo-500 text-xs font-bold"><Edit2 className="w-3 h-3" /> 重命名</div>
                          <input autoFocus className="w-full text-sm border-b-2 border-indigo-100 focus:border-indigo-500 pb-1 font-bold text-slate-700 outline-none" value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitRename()} />
                          <div className="flex justify-end gap-2 mt-1">
                             <button onClick={() => setRenamingId(null)} className="text-xs text-stone-400 px-2">取消</button>
                             <button onClick={submitRename} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-full">确定</button>
                          </div>
                      </div>
                  )}

                  {!user ? (
                      <div className="text-center mt-10 p-6 bg-white rounded-2xl border border-stone-100 shadow-sm flex flex-col items-center">
                          <Cloud className="w-10 h-10 text-stone-300 mb-3" />
                          <p className="text-xs font-bold text-slate-600 mb-4">登录 OneNote 云同步</p>
                          <button onClick={onLogin} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 shadow-lg shadow-indigo-100">
                             <LogIn className="w-3.5 h-3.5" /> <span>立即登录</span>
                          </button>
                      </div>
                  ) : loadingSessions ? (
                      <div className="flex justify-center mt-20 text-indigo-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                  ) : sessions.length === 0 ? (
                      <div className="text-center mt-20 text-stone-300 space-y-2"><Cloud className="w-12 h-12 mx-auto opacity-20" /><p className="text-xs">暂无笔记本分区</p></div>
                  ) : (
                      <div className="pb-20 min-h-[300px]">{renderTree(fileTree)}</div>
                  )}
              </div>
          )}

          {/* --- TAB: CALENDAR --- */}
          {activeTab === 'calendar' && (
              <div className="flex flex-col h-full bg-white">
                  {/* Calendar Header */}
                  <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                      <button onClick={handlePrevMonth} className="p-1 hover:bg-stone-100 rounded-full"><ChevronLeft className="w-4 h-4 text-stone-400" /></button>
                      <h3 className="font-bold text-slate-800 text-sm">
                          {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
                      </h3>
                      <button onClick={handleNextMonth} className="p-1 hover:bg-stone-100 rounded-full"><ChevronRight className="w-4 h-4 text-stone-400" /></button>
                  </div>

                  {/* Calendar Grid */}
                  <div className="p-2 border-b border-stone-100 bg-stone-50/30">
                      <div className="grid grid-cols-7 mb-2">
                          {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                              <div key={d} className="text-center text-[10px] text-stone-400 font-bold">{d}</div>
                          ))}
                      </div>
                      <div className="grid grid-cols-7 gap-y-1">
                          {Array.from({ length: getDaysInMonth(currentDate).firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                          {Array.from({ length: getDaysInMonth(currentDate).daysInMonth }).map((_, i) => {
                              const day = i + 1;
                              const dateStr = new Date(currentDate.getFullYear(), currentDate.getMonth(), day, 12).toISOString().slice(0, 10);
                              const isSelected = selectedDateStr === dateStr;
                              const hasEvent = events.some(e => e.dateStr === dateStr);
                              
                              return (
                                  <button
                                      key={day}
                                      onClick={() => handleDateClick(day)}
                                      className={`h-8 w-8 mx-auto rounded-full flex flex-col items-center justify-center relative transition-all ${
                                          isSelected ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-stone-100 text-slate-700'
                                      }`}
                                  >
                                      <span className="text-xs font-medium">{day}</span>
                                      {hasEvent && !isSelected && <div className="w-1 h-1 rounded-full bg-indigo-400 mt-0.5" />}
                                  </button>
                              );
                          })}
                      </div>
                  </div>

                  {/* Schedule List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
                      <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">今日日程</h4>
                          <button onClick={handleInitiateAddEvent} className="text-indigo-600 hover:bg-indigo-50 p-1 rounded transition-colors"><Plus className="w-4 h-4" /></button>
                      </div>

                      {/* Inline Event Input */}
                      {isAddingEvent && (
                        <div className="flex items-center space-x-2 p-2 bg-indigo-50 rounded-xl mb-2 border border-indigo-100 animate-in slide-in-from-top-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 ml-1"></div>
                            <input
                                autoFocus
                                value={newEventTitle}
                                onChange={e => setNewEventTitle(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') submitNewEvent();
                                    if (e.key === 'Escape') setIsAddingEvent(false);
                                }}
                                placeholder="输入日程标题..."
                                className="flex-1 bg-transparent border-none text-sm focus:ring-0 text-slate-700 placeholder:text-indigo-300 p-0 outline-none"
                            />
                            <button onClick={submitNewEvent} className="p-1 bg-indigo-500 text-white rounded shadow-sm hover:bg-indigo-600">
                                <Check className="w-3 h-3" />
                            </button>
                            <button onClick={() => setIsAddingEvent(false)} className="p-1 text-stone-400 hover:text-stone-600">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                      )}

                      {!user ? (
                          <div className="text-center py-8 text-stone-400 text-xs flex flex-col items-center">
                              <p className="mb-2">请先登录以同步日历</p>
                              <button onClick={onLogin} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">立即登录</button>
                          </div>
                      ) : isLoadingCalendar ? (
                          <div className="flex justify-center py-8 text-indigo-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
                      ) : events.filter(e => e.dateStr === selectedDateStr).length === 0 && !isAddingEvent ? (
                          <div className="text-center py-8 text-stone-300 text-xs">没有日程安排</div>
                      ) : (
                          events.filter(e => e.dateStr === selectedDateStr).map(evt => (
                              <div key={evt.id} className="flex items-start space-x-3 group">
                                  <div className="flex flex-col items-center mt-1">
                                      <div className={`w-2 h-2 rounded-full ${evt.type === 'study' ? 'bg-indigo-400' : evt.type === 'break' ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                                      <div className="w-0.5 h-full bg-stone-100 mt-1 min-h-[20px] group-last:hidden"></div>
                                  </div>
                                  <div className="flex-1 bg-stone-50 rounded-xl p-3 border border-stone-100 hover:border-indigo-100 transition-colors">
                                      <div className="flex justify-between items-start">
                                          <span className="font-bold text-slate-700 text-sm">{evt.title}</span>
                                          <button onClick={() => handleDeleteEvent(evt.id)} className="text-stone-300 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                                      </div>
                                      <div className="flex items-center space-x-2 mt-1 text-[10px] text-stone-400">
                                          <Clock className="w-3 h-3" /> <span>{evt.startTime} - {evt.endTime}</span>
                                      </div>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          )}

          {/* --- TAB: MEMO --- */}
          {activeTab === 'memo' && (
              <div className="flex flex-col h-full bg-stone-50">
                  {/* Memo Input */}
                  <div className="p-4 bg-white border-b border-stone-100 shadow-sm sticky top-0 z-10">
                      <div className="relative">
                          <textarea
                              value={memoInput}
                              onChange={e => setMemoInput(e.target.value)}
                              placeholder="记录当下的感悟或任务..."
                              className="w-full bg-stone-50 rounded-xl border-none text-sm p-3 focus:ring-2 focus:ring-indigo-100 resize-none h-20 placeholder:text-stone-400"
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddMemo(); } }}
                          />
                          <button 
                              onClick={handleAddMemo}
                              disabled={!memoInput.trim()}
                              className="absolute bottom-2 right-2 p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                          >
                              <CornerDownRight className="w-3.5 h-3.5" />
                          </button>
                      </div>
                  </div>

                  {/* Memo List (Waterfall/Stream) */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {!user ? (
                          <div className="text-center py-8 text-stone-400 text-xs flex flex-col items-center">
                              <PenTool className="w-8 h-8 mb-2 opacity-30" />
                              <p className="mb-2">请先登录以同步便签</p>
                              <button onClick={onLogin} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">立即登录</button>
                          </div>
                      ) : isLoadingMemos ? (
                          <div className="flex justify-center py-8 text-indigo-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
                      ) : memos.length === 0 ? (
                          <div className="flex flex-col items-center justify-center mt-10 text-stone-300 opacity-60">
                              <PenTool className="w-10 h-10 mb-2" />
                              <p className="text-xs font-bold">暂无随手记</p>
                          </div>
                      ) : (
                          memos.map(memo => (
                              <div key={memo.id} className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-top-2 duration-300">
                                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{memo.content}</p>
                                  <div className="flex justify-between items-center mt-3 pt-2 border-t border-stone-50">
                                      <span className="text-[10px] text-stone-400 font-mono">{new Date(memo.createdAt).toLocaleString()}</span>
                                      <button 
                                          onClick={() => handleDeleteMemo(memo.id)}
                                          className="text-stone-300 hover:text-rose-500 transition-colors p-1 rounded hover:bg-rose-50 opacity-0 group-hover:opacity-100"
                                      >
                                          <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                  </div>
                              </div>
                          ))
                      )}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
