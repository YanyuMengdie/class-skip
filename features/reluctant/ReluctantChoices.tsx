import React from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Coffee, FileText, Folder, Loader2, MessageCircle, Search, Sparkles, Upload } from 'lucide-react';
import type { AppLanguage, CloudSession } from '@/types';
import { getFolderPath } from '@/shared/layout/libraryFolders';
import type { OverviewStyle } from './overview';
import { StudyCompanionCat } from './StudyCompanionCat';
import './reluctant.css';

export type ReluctantMode = 'overview' | 'interest' | 'linear';

export const reluctantModeLabel = (mode: ReluctantMode, language: AppLanguage) => ({
  overview: language === 'en' ? 'What is this about?' : '大概讲的是什么',
  interest: language === 'en' ? 'Find an interesting way in' : '找个有意思的入口',
  linear: language === 'en' ? 'Plain language, from the start' : '大白话从头讲',
}[mode]);

export function ReluctantHome({ language, onChoose }: { language: AppLanguage; onChoose: (mode: ReluctantMode) => void }) {
  const en = language === 'en';
  const choices = [
    { mode: 'overview' as const, icon: FileText, number: '01', tag: en ? 'GET THE BIG PICTURE' : '先知道个大概', description: en ? 'Get the main ideas of the whole PDF, in plain language or as a story.' : '先把整份资料的主要内容讲给你。可以直接讲明白，也可以像故事一样串起来。', mood: en ? 'I am tired. Just give me the gist.' : '脑子很累，只想先知道个大概。', action: en ? 'Choose an explanation' : '选一种讲法' },
    { mode: 'interest' as const, icon: Sparkles, number: '02', tag: en ? 'FOLLOW YOUR CURIOSITY' : '先来一点兴趣', description: en ? 'Find a question, experiment, or surprising idea in your material. Start with what catches your eye.' : '从资料里挑一个有意思的问题、实验或现象，先看让你好奇的那一点。', mood: en ? 'I feel bored. Give me something interesting.' : '觉得无聊，想先来点兴趣。', action: en ? 'Find a way in' : '找个有意思的地方' },
    { mode: 'linear' as const, icon: BookOpen, number: '03', tag: en ? 'TAKE IT A LITTLE AT A TIME' : '有人陪着慢慢看', description: en ? 'Follow the material from the beginning, with a simple explanation of one small part at a time.' : '按资料顺序，用简单的话一点点展开。每次只讲一小段，愿意再看就继续。', mood: en ? 'I do not want to read alone. Walk me through it.' : '不想自己啃，但愿意跟着慢慢看。', action: en ? 'Start at the beginning' : '从开头慢慢来' },
  ];
  return <div className="reluctant-flow">
    <section className="reluctant-intro reluctant-intro--home">
      <div className="reluctant-intro-copy">
        <div className="reluctant-eyebrow"><Coffee size={16} /> {en ? 'A LITTLE IS ENOUGH' : '慢一点，也没关系'}</div>
        <h2>{en ? 'You do not have to learn a lot today.' : '今天不用学很多'}</h2>
      </div>
      <div className="reluctant-home-companion"><StudyCompanionCat language={language} /></div>
      <p>{en ? 'Choose a way that feels easy right now. Pick your material afterwards.' : '选一种现在读得进去的方式，资料等会儿再挑。'}</p>
    </section>
    <div className="reluctant-section-label"><span>{en ? 'Where would you like to begin?' : '今天想怎么轻松一点？'}</span><span>{en ? 'Three ways to begin' : '三种开始的方式'}</span></div>
    <div className="reluctant-doorways">
      {choices.map(({ mode, icon: Icon, number, tag, description, mood, action }) => <button key={mode} type="button" onClick={() => onChoose(mode)} className={`reluctant-doorway reluctant-doorway--${mode}`}>
        <div className="reluctant-card-top"><span className="reluctant-card-icon"><Icon size={25} strokeWidth={1.5} /></span><span className="reluctant-card-number">{number}</span></div>
        <p className="reluctant-card-tag">{tag}</p>
        <h3>{reluctantModeLabel(mode, language)}</h3>
        <p className="reluctant-card-description">{description}</p>
        <div className="reluctant-mood"><span>{en ? 'For when…' : '适合现在的你'}</span><p>{mood}</p></div>
        <div className="reluctant-card-action">{action}<ArrowRight size={18} /></div>
      </button>)}
    </div>
    <p className="reluctant-footnote">{en ? 'There is no right choice. You can always come back and try another way.' : '不用选对，也不用一次看完。随时可以回来，换一种方式。'}</p>
  </div>;
}

export function OverviewStyleChoices({ language, onChoose, onBack }: { language: AppLanguage; onChoose: (style: OverviewStyle) => void; onBack: () => void }) {
  const en = language === 'en';
  return <div className="reluctant-flow">
    <button type="button" className="reluctant-back" onClick={onBack}><ChevronLeft size={16} />{en ? 'Back to the three ways' : '回到三种方式'}</button>
    <section className="reluctant-intro reluctant-intro--compact">
      <div className="reluctant-eyebrow">{en ? 'THE BIG PICTURE' : '大概讲的是什么'}</div>
      <h2>{en ? 'How would you like it explained?' : '想怎么讲给你？'}</h2>
      <p>{en ? 'Both explain the main ideas of the whole PDF. Choose the style you feel like reading.' : '两种讲法都会讲整份资料的主线，选你现在更想看的那一种。'}</p>
    </section>
    <div className="reluctant-style-grid">
      {(['plain', 'story'] as OverviewStyle[]).map(style => <button key={style} type="button" className={`reluctant-doorway reluctant-doorway--${style === 'plain' ? 'overview' : 'interest'}`} onClick={() => onChoose(style)}>
        <div className="reluctant-card-top"><span className="reluctant-card-icon">{style === 'plain' ? <MessageCircle size={25} strokeWidth={1.5} /> : <BookOpen size={25} strokeWidth={1.5} />}</span><span className="reluctant-card-tag">{en ? 'Whole-PDF overview' : '整份资料 · 主线讲解'}</span></div>
        <h3>{style === 'plain' ? (en ? 'Plain language' : '大白话讲解') : (en ? 'Story explanation' : '故事讲解')}</h3>
        <p className="reluctant-card-description">{style === 'plain' ? (en ? 'Like a friend explaining things clearly: familiar words, helpful examples, and the connections filled in.' : '像朋友在旁边解释：少一点术语，把背景、例子和前后关系直接讲明白。') : (en ? 'Follow scenes, cases, and discoveries as they connect the main ideas into a flowing explanation.' : '用场景、案例和研究经过，把知识串起来。像看故事一样，慢慢看进去。')}</p>
        <div className="reluctant-mood"><span>{en ? 'For when…' : '适合现在的你'}</span><p>{style === 'plain' ? (en ? 'I want to understand without much effort.' : '想省点力，直接看懂。') : (en ? 'I want to ease into it through a story.' : '想有人串起来讲，慢慢带进去。')}</p></div>
        <div className="reluctant-card-action">{en ? 'Choose a PDF' : '接下来，选一份 PDF'}<ArrowRight size={18} /></div>
      </button>)}
    </div>
  </div>;
}

export function ReluctantPdfPicker({ language, mode, style, files, folders, covers, loading, signedIn, onChoose, onBack, onLibrary, onLogin }: {
  language: AppLanguage; mode: ReluctantMode; style: OverviewStyle; files: CloudSession[]; folders: CloudSession[]; covers: Record<string, string>;
  loading: boolean; signedIn: boolean; onChoose: (id: string) => void; onBack: () => void; onLibrary: () => void; onLogin: () => void;
}) {
  const [query, setQuery] = React.useState('');
  const [location, setLocation] = React.useState<{ kind: 'root' } | { kind: 'folder'; id: string } | { kind: 'other' }>({ kind: 'root' });
  const en = language === 'en';
  const folderIds = new Set(folders.map(folder => folder.id));
  const currentFolder = location.kind === 'folder' ? folders.find(folder => folder.id === location.id) : undefined;
  const inOther = location.kind === 'other';
  const atRoot = !inOther && !currentFolder;
  const search = query.trim().toLocaleLowerCase();
  const otherFiles = files.filter(file => !file.parentId || !folderIds.has(file.parentId));
  const path = getFolderPath(currentFolder?.id, folders);
  const filePath = (file: CloudSession) => getFolderPath(file.parentId, folders).map(folder => folder.customTitle || folder.fileName).join(' / ') || (en ? 'Other' : '其他');
  const visibleFolders = search || inOther ? [] : folders.filter(folder => currentFolder
    ? folder.parentId === currentFolder.id
    : !folder.parentId || !folderIds.has(folder.parentId))
    .sort((a, b) => (a.customTitle || a.fileName).localeCompare(b.customTitle || b.fileName));
  const folderCounts = new Map<string, number>();
  for (const file of files) for (const folder of getFolderPath(file.parentId, folders)) folderCounts.set(folder.id, (folderCounts.get(folder.id) || 0) + 1);
  const matches = search
    ? files.filter(file => `${file.customTitle || ''} ${file.fileName} ${filePath(file)}`.toLocaleLowerCase().includes(search))
    : inOther ? otherFiles : currentFolder ? files.filter(file => file.parentId === currentFolder.id) : [];
  const showOther = !search && atRoot && otherFiles.length > 0;
  const hasResults = visibleFolders.length > 0 || showOther || matches.length > 0;
  const openRoot = () => { setLocation({ kind: 'root' }); setQuery(''); };
  const openFolder = (id: string) => { setLocation({ kind: 'folder', id }); setQuery(''); };
  const chosenLabel = mode === 'overview' ? `${reluctantModeLabel(mode, language)} · ${style === 'plain' ? (en ? 'Plain language' : '大白话讲解') : (en ? 'Story explanation' : '故事讲解')}` : reluctantModeLabel(mode, language);
  return <div className="reluctant-flow">
    <button type="button" className="reluctant-back" onClick={onBack}><ChevronLeft size={16} />{en ? 'Change the explanation' : '换一种讲法'}</button>
    <section className="reluctant-intro reluctant-intro--compact">
      <div className="reluctant-eyebrow">{chosenLabel}</div>
      <h2>{en ? 'Which PDF shall we read?' : '这次想看哪份 PDF？'}</h2>
      <p>{en ? 'Open a folder, then choose a PDF. Unfiled materials are in Other.' : '先打开文件夹，再选一份 PDF。未分类的资料都在「其他」里。'}</p>
    </section>
    {!signedIn ? <div className="reluctant-empty"><BookOpen size={30} /><p>{en ? 'Sign in to choose from your library.' : '登录后，就能选择资料库里的 PDF。'}</p><button type="button" onClick={onLogin}>{en ? 'Sign in' : '登录并选择资料'}</button></div> : loading ? <div className="reluctant-empty" role="status"><Loader2 className="animate-spin" size={26} /><p>{en ? 'Loading your materials…' : '正在取来你的资料…'}</p></div> : <>
      <div className="reluctant-picker-toolbar"><label className="reluctant-search"><Search size={17} /><input aria-label={en ? 'Search PDFs' : '搜索 PDF'} value={query} onChange={e => setQuery(e.target.value)} placeholder={en ? 'Find a material' : '找一份资料'} /></label><button type="button" className="reluctant-back" onClick={onLibrary}><Upload size={16} />{en ? 'Add a PDF' : '去资料库上传'}</button></div>
      <nav className="reluctant-picker-path" aria-label={en ? 'Folder path' : '文件夹路径'}>
        <button type="button" onClick={openRoot} aria-current={atRoot && !search ? 'page' : undefined}>{en ? 'All folders' : '全部文件夹'}</button>
        {path.map(folder => <React.Fragment key={folder.id}><ChevronRight size={14} /><button type="button" onClick={() => openFolder(folder.id)} aria-current={!search && folder.id === currentFolder?.id ? 'page' : undefined}>{folder.customTitle || folder.fileName}</button></React.Fragment>)}
        {inOther && <><ChevronRight size={14} /><button type="button" onClick={() => setQuery('')} aria-current={!search ? 'page' : undefined}>{en ? 'Other' : '其他'}</button></>}
        {search && <span className="reluctant-picker-search-note">{en ? `Searching all materials · ${matches.length} found` : `搜索全部资料 · ${matches.length} 个结果`}</span>}
      </nav>
      {hasResults ? <div className="reluctant-pdf-grid">
        {visibleFolders.map(folder => <button type="button" key={`folder:${folder.id}`} className="reluctant-pdf-card reluctant-folder-card" onClick={() => openFolder(folder.id)}>
          <div className="reluctant-folder-icon"><Folder size={30} strokeWidth={1.5} /></div>
          <div className="min-w-0 flex-1"><h3>{folder.customTitle || folder.fileName}</h3><p>{en ? `${folderCounts.get(folder.id) || 0} PDFs · Open folder` : `${folderCounts.get(folder.id) || 0} 份资料 · 打开文件夹`} <ChevronRight size={15} /></p></div>
        </button>)}
        {showOther && <button type="button" className="reluctant-pdf-card reluctant-folder-card" onClick={() => setLocation({ kind: 'other' })}>
          <div className="reluctant-folder-icon"><Folder size={30} strokeWidth={1.5} /></div>
          <div className="min-w-0 flex-1"><h3>{en ? 'Other' : '其他'}</h3><p>{en ? `${otherFiles.length} unfiled PDFs` : `${otherFiles.length} 份未分类资料`} <ChevronRight size={15} /></p></div>
        </button>}
        {matches.map(file => <button type="button" key={file.id} className="reluctant-pdf-card" onClick={() => onChoose(file.id)}>
        <div className="reluctant-pdf-cover">{covers[file.id] ? <img src={covers[file.id]} alt="" /> : <FileText size={30} strokeWidth={1.3} />}</div>
        <div className="min-w-0 flex-1"><h3>{file.customTitle || file.fileName}</h3>{search && <span className="reluctant-file-path">{filePath(file)}</span>}<p>{en ? 'Read this PDF' : '就看这份'} <ArrowRight size={15} /></p></div>
      </button>)}</div> : <div className="reluctant-empty"><FileText size={30} /><p>{search ? (en ? 'No matching PDFs. Try another name.' : '没找到这份资料，试试换个名字。') : !atRoot ? (en ? 'This folder has no PDFs yet.' : '这个文件夹里还没有 PDF。') : (en ? 'Add a PDF to your library to get started.' : '先往资料库放一份 PDF，就可以开始了。')}</p>{!search && <button type="button" onClick={onLibrary}>{en ? 'Open library' : '去资料库上传'}</button>}</div>}
    </>}
  </div>;
}
