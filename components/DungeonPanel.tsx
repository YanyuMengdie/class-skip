import React, { useState, useEffect, useRef } from 'react';
import { X, Map, Swords, Lock, CheckCircle2, Clock, Dice1, Sparkles, Trophy, Coins, Package, BookOpen, HelpCircle } from 'lucide-react';
import { DungeonState, DungeonRoom, DungeonItem, DungeonEvent } from '../types';
import { INITIAL_ROOMS, DUNGEON_ITEMS, DUNGEON_STORIES } from '../data/dungeonData';
import { rollD20, formatStudyTime, calculateDiceEarned } from '../utils/dungeonUtils';
import { generateRandomEvent, checkEventSuccess, getEventResultText } from '../utils/dungeonEvents';

interface DungeonPanelProps {
  isOpen: boolean;
  onClose: () => void;
  state: DungeonState;
  onUpdateState: (updates: Partial<DungeonState>) => void;
  studyTimeSeconds: number; // 当前学习时间（秒）
}

export const DungeonPanel: React.FC<DungeonPanelProps> = ({
  isOpen,
  onClose,
  state,
  onUpdateState,
  studyTimeSeconds
}) => {
  const [currentEvent, setCurrentEvent] = useState<DungeonEvent | null>(null);
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [eventResult, setEventResult] = useState<string | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const exploreIntervalRef = useRef<number | null>(null);

  const studyMinutes = Math.floor(studyTimeSeconds / 60);
  const totalStudyMinutes = state.totalStudyMinutes + studyMinutes;

  // 检查是否可以触发事件（2-3 分钟探索时间）
  useEffect(() => {
    if (!state.exploring || !state.eventStartTime) {
      if (exploreIntervalRef.current) {
        clearInterval(exploreIntervalRef.current);
        exploreIntervalRef.current = null;
      }
      return;
    }

    const triggerTime = 2 + Math.random(); // 2-3 分钟随机（分钟）
    const triggerTimeMs = triggerTime * 60 * 1000; // 转换为毫秒

    exploreIntervalRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - state.eventStartTime!;
      if (elapsedMs >= triggerTimeMs) {
        // 触发事件
        const event = generateRandomEvent();
        setCurrentEvent(event);
        onUpdateState({ exploring: false, eventStartTime: null });
        if (exploreIntervalRef.current) {
          clearInterval(exploreIntervalRef.current);
          exploreIntervalRef.current = null;
        }
      }
    }, 1000); // 每秒检查一次

    return () => {
      if (exploreIntervalRef.current) {
        clearInterval(exploreIntervalRef.current);
        exploreIntervalRef.current = null;
      }
    };
  }, [state.exploring, state.eventStartTime, onUpdateState]);

  const handleStartExplore = () => {
    if (state.dicePool === 0) {
      alert('你需要先学习获得骰子！每学习 25 分钟可获得 1 个 D20。');
      return;
    }
    onUpdateState({ exploring: true, eventStartTime: Date.now() });
  };

  const handleRollDice = () => {
    if (!currentEvent || state.dicePool === 0) return;
    
    setIsRolling(true);
    // 模拟骰子动画
    setTimeout(() => {
      const result = rollD20(totalStudyMinutes);
      setDiceResult(result);
      const success = checkEventSuccess(result, currentEvent.difficultyClass);
      const resultText = getEventResultText(currentEvent, success, result);
      setEventResult(resultText);

      // 消耗骰子
      const newDicePool = state.dicePool - 1;
      onUpdateState({ dicePool: newDicePool });

      // 如果成功，给予奖励
      if (success && currentEvent.rewards) {
        const updates: Partial<DungeonState> = {};
        if (currentEvent.rewards.gold) {
          updates.gold = state.gold + currentEvent.rewards.gold;
        }
        if (currentEvent.rewards.itemId) {
          const existingItem = state.items.find(i => i.id === currentEvent.rewards.itemId);
          if (existingItem) {
            updates.items = state.items.map(i => 
              i.id === existingItem.id ? { ...i, count: (i.count || 1) + 1 } : i
            );
          } else {
            const newItem = DUNGEON_ITEMS.find(i => i.id === currentEvent.rewards.itemId);
            if (newItem) {
              updates.items = [...state.items, { ...newItem, count: 1 }];
            }
          }
        }
        if (currentEvent.rewards.roomId) {
          updates.rooms = state.rooms.map(r =>
            r.id === currentEvent.rewards.roomId ? { ...r, unlocked: true } : r
          );
        }
        if (currentEvent.rewards.storyId) {
          updates.stories = state.stories.map(s =>
            s.id === currentEvent.rewards.storyId ? { ...s, unlocked: true } : s
          );
        }
        onUpdateState(updates);
      }

      setIsRolling(false);
    }, 1500);
  };

  const handleCloseEvent = () => {
    setCurrentEvent(null);
    setDiceResult(null);
    setEventResult(null);
  };

  // 计算可用骰子数量（基于学习时间）
  useEffect(() => {
    const earnedDice = calculateDiceEarned(totalStudyMinutes);
    const currentDice = state.dicePool;
    // 如果新获得的骰子数量大于当前，更新
    if (earnedDice > currentDice) {
      onUpdateState({ dicePool: earnedDice, totalStudyMinutes });
    }
  }, [totalStudyMinutes]);

  if (!isOpen) return null;

  const currentRoom = state.rooms.find(r => r.id === state.currentRoomId) || state.rooms[0];
  const clearedRooms = state.rooms.filter(r => r.cleared).length;
  const unlockedStories = state.stories.filter(s => s.unlocked).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-700 bg-slate-800/50 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Swords className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">无尽地牢</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRules(true)}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
            title="游戏规则"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Map */}
        <aside className="w-80 flex flex-col border-r border-slate-700 bg-slate-800/30 overflow-y-auto">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Map className="w-4 h-4" />
              探险地图
            </h2>
          </div>
          <div className="flex-1 p-4 space-y-4">
            {state.rooms.map((room, idx) => {
              const isCurrent = room.id === state.currentRoomId;
              const isLast = idx === state.rooms.length - 1;
              return (
                <div key={room.id} className="relative pl-8 group">
                  {!isLast && (
                    <div className={`absolute left-2.5 top-8 bottom-[-16px] w-0.5 ${
                      room.cleared ? 'bg-primary/30' : 'bg-panel-border'
                    }`} />
                  )}
                  <div className={`absolute left-0 top-1 size-5 rounded-full flex items-center justify-center ring-4 ring-slate-900 z-10 ${
                    room.cleared ? 'bg-indigo-500' : room.unlocked ? 'bg-slate-100 text-slate-900' : 'bg-slate-700'
                  }`}>
                    {room.cleared ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : room.unlocked ? (
                      <Map className="w-3 h-3" />
                    ) : (
                      <Lock className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                  <div className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-800 border-indigo-500 shadow-lg'
                      : room.unlocked
                        ? 'bg-slate-700/30 border-transparent hover:border-indigo-500/30'
                        : 'bg-slate-700/10 border-dashed border-slate-700 opacity-60'
                  }`}>
                    <div className="flex justify-between items-start mb-1">
                      <h3 className={`font-semibold ${isCurrent ? 'text-white' : room.unlocked ? 'text-slate-200' : 'text-slate-400'}`}>
                        {room.name}
                      </h3>
                      {room.cleared && (
                        <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">已清理</span>
                      )}
                      {isCurrent && (
                        <span className="text-xs font-mono text-slate-100 bg-indigo-500 px-1.5 py-0.5 rounded">当前</span>
                      )}
                      {!room.unlocked && (
                        <span className="text-xs font-mono text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">已锁定</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{room.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: Main Area */}
        <main className="flex-1 flex flex-col relative bg-slate-900">
          {currentEvent ? (
            // Event Modal
            <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-8">
              <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full p-8 relative">
                <button
                  onClick={handleCloseEvent}
                  className="absolute top-4 right-4 p-2 hover:bg-slate-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <div className="mb-6">
                  <span className="px-2 py-0.5 rounded text-xs uppercase tracking-widest font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    {currentEvent.type === 'combat' ? '战斗' : 
                     currentEvent.type === 'puzzle' ? '谜题' :
                     currentEvent.type === 'treasure' ? '宝藏' : '奇遇'}
                  </span>
                  <span className="ml-3 text-slate-400 text-xs">难度等级 {currentEvent.difficultyClass}</span>
                </div>

                <h2 className="text-3xl font-bold text-white mb-4">{currentEvent.title}</h2>
                <p className="text-slate-300 text-lg mb-8">{currentEvent.description}</p>

                {/* D20 Dice Area */}
                <div className="flex flex-col items-center justify-center py-8">
                  {diceResult === null ? (
                    <button
                      onClick={handleRollDice}
                      disabled={isRolling || state.dicePool === 0}
                      className="relative w-48 h-48 flex items-center justify-center transition-transform duration-500 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="absolute inset-0 bg-indigo-500/20 blur-[60px] rounded-full"></div>
                      <div className="relative bg-slate-800 border-2 border-indigo-500 rounded-lg w-32 h-32 flex items-center justify-center text-4xl font-bold text-indigo-400 shadow-lg shadow-indigo-500/50">
                        {isRolling ? '...' : 'D20'}
                      </div>
                    </button>
                  ) : (
                    <div className="text-center">
                      <div className="text-6xl font-bold text-indigo-400 mb-4">{diceResult}</div>
                      <p className="text-slate-300">{eventResult}</p>
                    </div>
                  )}

                  <div className="mt-6 flex items-center gap-2 bg-slate-700/30 border border-slate-700 rounded-full px-4 py-2">
                    <Dice1 className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs text-slate-400">
                      消耗 <span className="text-white font-bold">1 个 D20</span> • 从 <span className="text-white">{formatStudyTime(currentEvent.requiredStudyMinutes)}</span> 学习中获得
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Main Content
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-white mb-2">{currentRoom.name}</h2>
                <p className="text-slate-300">{currentRoom.description}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-400">{state.level}</div>
                  <div className="text-xs text-slate-400 uppercase">等级</div>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-indigo-400">{state.dicePool}</div>
                  <div className="text-xs text-slate-400 uppercase">可用 D20</div>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{state.gold}</div>
                  <div className="text-xs text-slate-400 uppercase">金币</div>
                </div>
              </div>

              {/* Explore Button */}
              <button
                onClick={handleStartExplore}
                disabled={state.exploring || state.dicePool === 0}
                className={`px-8 py-4 rounded-lg font-bold text-lg transition-all ${
                  state.exploring
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : state.dicePool === 0
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/50'
                }`}
              >
                {state.exploring ? (
                  <>
                    <Clock className="w-5 h-5 inline mr-2 animate-spin" />
                    探索中... (2-3 分钟后触发事件)
                  </>
                ) : state.dicePool === 0 ? (
                  '需要学习获得骰子'
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 inline mr-2" />
                    探索下一个房间
                  </>
                )}
              </button>

              <p className="mt-4 text-xs text-slate-400 text-center">
                已学习: {formatStudyTime(totalStudyMinutes)} • 已清理房间: {clearedRooms}/{state.rooms.length}
              </p>
            </div>
          )}
        </main>

        {/* Right Sidebar: Character & Inventory */}
        <aside className="w-80 border-l border-slate-700 bg-slate-800 flex flex-col">
          {/* Character Summary */}
          <div className="p-6 border-b border-slate-700">
            <h2 className="text-white font-bold text-lg mb-2">探索者</h2>
            <div className="text-xs text-indigo-400 mb-4">等级 {state.level} 学者</div>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-indigo-500" style={{ width: `${(state.xp / state.xpToNextLevel) * 100}%` }}></div>
            </div>
            <div className="text-[10px] text-slate-400">{state.xp} / {state.xpToNextLevel} XP</div>
          </div>

          {/* Dice Pool */}
          <div className="p-6 border-b border-slate-700">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider">骰子池</h3>
              <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-0.5 rounded-full border border-indigo-500/30">
                {state.dicePool} 可用
              </span>
            </div>
            <div className="flex justify-center gap-2">
              {Array.from({ length: Math.min(state.dicePool, 5) }).map((_, i) => (
                <div key={i} className="size-12 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-indigo-500/20 rounded-lg"></div>
                  <span className="text-xs font-bold text-indigo-400 relative z-10">20</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-center text-slate-400 mt-2">
              每学习 25 分钟获得 1 个 D20
            </p>
          </div>

          {/* Inventory */}
          <div className="flex-1 overflow-y-auto p-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
              道具栏 ({state.items.length}/20)
            </h3>
            <div className="grid grid-cols-4 gap-2">
              {state.items.map((item) => (
                <div
                  key={item.id}
                  className="aspect-square bg-slate-700/40 rounded border border-slate-700 hover:border-indigo-500/50 cursor-pointer flex items-center justify-center relative group"
                >
                  <Package className="w-6 h-6 text-slate-400" />
                  {item.count && item.count > 1 && (
                    <div className="absolute bottom-0 right-0 bg-black/60 text-[8px] px-1 rounded-tl text-white">
                      {item.count}
                    </div>
                  )}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 20 - state.items.length) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square bg-slate-700/10 rounded border border-slate-700/30"></div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* 游戏规则说明面板 */}
      {showRules && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 relative">
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 p-2 hover:bg-slate-700 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-400" />
              游戏规则
            </h2>

            <div className="space-y-6 text-slate-300">
              <section>
                <h3 className="text-lg font-bold text-white mb-3">🎯 核心玩法</h3>
                <p className="mb-2">这是一个将学习时间转化为游戏奖励的系统。你学习的时间越长，获得的奖励越多！</p>
              </section>

              <section>
                <h3 className="text-lg font-bold text-white mb-3">🎲 D20 骰子系统</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li><strong className="text-white">获得骰子：</strong>每学习 25 分钟可获得 1 个 D20 骰子</li>
                  <li><strong className="text-white">骰子概率：</strong>学习时间越长，投出高点数（15-20）的概率越高</li>
                  <li><strong className="text-white">使用骰子：</strong>探索房间时遇到事件，需要投掷 D20 来挑战</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-bold text-white mb-3">🗺️ 探索系统</h3>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>点击<strong className="text-white">「探索下一个房间」</strong>按钮开始探索</li>
                  <li>等待 2-3 分钟后，会随机触发一个事件（战斗、谜题、宝藏或奇遇）</li>
                  <li>事件出现后，消耗 1 个 D20 骰子进行投掷</li>
                  <li>如果骰子结果 ≥ 难度等级（DC），则挑战成功，获得奖励</li>
                  <li>如果失败，则没有奖励，但可以继续探索</li>
                </ol>
              </section>

              <section>
                <h3 className="text-lg font-bold text-white mb-3">💰 奖励系统</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li><strong className="text-yellow-400">金币：</strong>成功完成事件可获得金币</li>
                  <li><strong className="text-indigo-400">道具：</strong>可能获得各种稀有度的道具（普通、稀有、史诗、传说）</li>
                  <li><strong className="text-purple-400">房间解锁：</strong>某些道具可以解锁新的房间</li>
                  <li><strong className="text-green-400">剧情：</strong>完成特定事件可解锁剧情章节</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-bold text-white mb-3">📊 等级与经验</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>完成事件可获得经验值（XP）</li>
                  <li>经验值达到上限后，等级提升</li>
                  <li>等级越高，解锁的内容越多</li>
                </ul>
              </section>

              <section>
                <h3 className="text-lg font-bold text-white mb-3">💾 云端保存</h3>
                <p>登录 Google 账号后，你的游戏进度会自动保存到云端。即使更换设备或刷新页面，进度也不会丢失。</p>
              </section>

              <section>
                <h3 className="text-lg font-bold text-white mb-3">💡 小贴士</h3>
                <ul className="list-disc list-inside space-y-2 ml-2">
                  <li>学习时间越长，骰子投出高点的概率越高，更容易成功</li>
                  <li>不同事件有不同的难度等级，难度越高奖励越好</li>
                  <li>收集道具可以增强你的能力，帮助你更好地探索</li>
                  <li>这是一个无尽地牢，可以一直探索下去！</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
