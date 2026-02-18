
import React, { useState, useEffect } from 'react';
import { X, Wand2, Sparkles, Loader2, Image as ImageIcon, User as UserIcon, Heart, Smile } from 'lucide-react';
import { generateCharacterAvatar, generateGalgameBackground } from '../services/imageGen';
import { uploadImageBlob } from '../services/firebase';
import { User } from 'firebase/auth';
import { PersonaSettings } from '../types';

interface GalgameSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSetAvatar: (url: string) => void;
  onSetBackground: (url: string) => void;
  initialPersona: PersonaSettings;
  onSavePersona: (settings: PersonaSettings) => void;
}

const RELATIONSHIPS = ["妻子", "丈夫", "朋友", "男友", "女友", "暗恋对象", "暧昧对象", "儿子", "女儿", "同学", "兄弟", "闺蜜", "女仆", "导师"];
const PERSONALITIES = ["幽默风趣", "占有欲强", "儒雅文艺", "霸道专一", "温柔体贴", "沉稳可靠", "腹黑", "傲娇", "沉稳内向", "真诚友善", "中二病", "高冷"];

export const GalgameSettings: React.FC<GalgameSettingsProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  onSetAvatar, 
  onSetBackground,
  initialPersona,
  onSavePersona
}) => {
  const [avatarPrompt, setAvatarPrompt] = useState('');
  const [bgPrompt, setBgPrompt] = useState('');
  
  // Persona State
  const [persona, setPersona] = useState<PersonaSettings>(initialPersona);
  
  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);

  // Reset persona state when opened
  useEffect(() => {
    if (isOpen) setPersona(initialPersona);
  }, [isOpen, initialPersona]);

  const handleGenerateAvatar = async () => {
    if (!avatarPrompt.trim()) return;
    if (!user) { alert("请先登录，生成的资源需要保存到云端。"); return; }

    setIsGeneratingAvatar(true);
    try {
        const imageBlob = await generateCharacterAvatar(avatarPrompt);
        const downloadUrl = await uploadImageBlob(user, imageBlob);
        onSetAvatar(downloadUrl);
        setAvatarPrompt('');
        alert("角色生成成功！");
    } catch (e) {
        console.error("Avatar Gen Failed:", e);
        alert("生成失败，请重试。");
    } finally {
        setIsGeneratingAvatar(false);
    }
  };

  const handleGenerateBackground = async () => {
    if (!bgPrompt.trim()) return;
    if (!user) { alert("请先登录，生成的资源需要保存到云端。"); return; }

    setIsGeneratingBg(true);
    try {
        const imageBlob = await generateGalgameBackground(bgPrompt);
        const downloadUrl = await uploadImageBlob(user, imageBlob);
        onSetBackground(downloadUrl);
        setBgPrompt('');
        alert("背景生成成功！");
    } catch (e) {
        console.error("Background Gen Failed:", e);
        alert("生成失败，请重试。");
    } finally {
        setIsGeneratingBg(false);
    }
  };

  const handlePersonaChange = (field: keyof PersonaSettings, value: string) => {
      setPersona(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveAndClose = () => {
      onSavePersona(persona);
      onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-[32px] p-8 max-w-lg w-full shadow-2xl relative border border-white/50 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
                onClick={onClose}
                className="absolute top-6 right-6 text-stone-400 hover:text-slate-600 p-2 hover:bg-stone-100 rounded-full transition-colors"
            >
                <X className="w-5 h-5" />
            </button>
            
            <div className="flex flex-col items-center mb-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-tr from-pink-400 to-purple-500 rounded-full flex items-center justify-center shadow-lg mb-4 ring-4 ring-purple-100">
                    <Wand2 className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight">AI 场景工坊</h3>
                <p className="text-sm text-slate-500 mt-2 font-medium">定制专属于你的沉浸式学习环境</p>
            </div>
            
            {/* Section 0: Persona Settings */}
            <div className="mb-8">
                <div className="flex items-center space-x-2 text-sm font-bold text-slate-700 mb-4">
                    <div className="p-1.5 bg-violet-100 text-violet-500 rounded-lg">
                        <Smile className="w-4 h-4" />
                    </div>
                    <span>角色设定 (Persona)</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="text-xs font-bold text-stone-400 block mb-1.5 ml-1">角色名字</label>
                        <input 
                            type="text" 
                            value={persona.charName}
                            onChange={(e) => handlePersonaChange('charName', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-stone-400 block mb-1.5 ml-1">对我的称呼</label>
                        <input 
                            type="text" 
                            value={persona.userNickname}
                            onChange={(e) => handlePersonaChange('userNickname', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="text-xs font-bold text-stone-400 block mb-1.5 ml-1">关系</label>
                        <select 
                            value={persona.relationship}
                            onChange={(e) => handlePersonaChange('relationship', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                        >
                            {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-stone-400 block mb-1.5 ml-1">性格</label>
                        <select 
                            value={persona.personality}
                            onChange={(e) => handlePersonaChange('personality', e.target.value)}
                            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-300"
                        >
                            {PERSONALITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="w-full h-px bg-stone-100 mb-8"></div>

            {/* Section 1: Character Visual */}
            <div className="mb-8">
                <label className="flex items-center space-x-2 text-sm font-bold text-slate-700 mb-3">
                    <div className="p-1.5 bg-pink-100 text-pink-500 rounded-lg">
                        <UserIcon className="w-4 h-4" />
                    </div>
                    <span>立绘生成 (Visual)</span>
                </label>
                <textarea 
                    value={avatarPrompt}
                    onChange={(e) => setAvatarPrompt(e.target.value)}
                    placeholder="例如：一位银色长发、红色瞳孔的吸血鬼少女，穿着哥特萝莉装，表情傲娇..."
                    className="w-full h-24 p-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm mb-3 focus:ring-2 focus:ring-pink-200 focus:border-pink-300 resize-none transition-all"
                />
                <button
                    onClick={handleGenerateAvatar}
                    disabled={isGeneratingAvatar || !avatarPrompt.trim()}
                    className="w-full py-3 bg-white border-2 border-pink-100 text-pink-500 rounded-xl font-bold hover:bg-pink-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-[0.98]"
                >
                    {isGeneratingAvatar ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>正在绘制中...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4" />
                            <span>生成角色立绘</span>
                        </>
                    )}
                </button>
            </div>

            <div className="w-full h-px bg-stone-100 mb-8"></div>

            {/* Section 2: Background */}
            <div className="mb-8">
                <label className="flex items-center space-x-2 text-sm font-bold text-slate-700 mb-3">
                    <div className="p-1.5 bg-indigo-100 text-indigo-500 rounded-lg">
                        <ImageIcon className="w-4 h-4" />
                    </div>
                    <span>环境生成 (Background)</span>
                </label>
                <textarea 
                    value={bgPrompt}
                    onChange={(e) => setBgPrompt(e.target.value)}
                    placeholder="例如：充满漂浮魔法书的古老图书馆，窗外是璀璨星空..."
                    className="w-full h-24 p-4 bg-stone-50 border border-stone-200 rounded-2xl text-sm mb-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 resize-none transition-all"
                />
                <button
                    onClick={handleGenerateBackground}
                    disabled={isGeneratingBg || !bgPrompt.trim()}
                    className="w-full py-3 bg-white border-2 border-indigo-100 text-indigo-500 rounded-xl font-bold hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-[0.98]"
                >
                    {isGeneratingBg ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>正在渲染中...</span>
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4" />
                            <span>生成场景背景</span>
                        </>
                    )}
                </button>
            </div>

            <button 
                onClick={handleSaveAndClose}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 shadow-xl active:scale-[0.98] transition-all"
            >
                保存所有设定
            </button>
        </div>
    </div>
  );
};
