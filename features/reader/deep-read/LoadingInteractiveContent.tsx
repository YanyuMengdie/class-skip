import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';

interface Particle {
  id: string;
  x: number;
  y: number;
  color: string;
  angle: number;
  velocity: number;
  life: number;
}

interface LoadingInteractiveContentProps {
  onInteraction?: () => void;
}

export const LoadingInteractiveContent: React.FC<LoadingInteractiveContentProps> = ({ onInteraction }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [tipIndex, setTipIndex] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // 学习小贴士数组
  const learningTips = [
    "💡 尝试用自己的话复述刚学的内容",
    "📝 记笔记时用不同颜色标记重点",
    "🔄 间隔重复复习效果更好",
    "❓ 遇到不懂的地方随时提问",
    "🎯 设定小目标，逐步完成",
    "🧠 理解比记忆更重要",
    "⏰ 专注学习25分钟后休息5分钟",
    "🔗 尝试将新知识与已有知识连接",
    "✨ 保持好奇心，多问为什么",
    "📚 定期回顾之前学过的内容"
  ];

  // 创建粒子 - 优化：使用 useCallback 和性能优化
  const createParticles = useCallback((x: number, y: number) => {
    // 节流：如果粒子太多，减少新粒子数量
    setParticles(prev => {
      if (prev.length >= 25) {
        // 如果粒子过多，只创建少量新粒子
        return prev;
      }
      return prev;
    });

    const newParticles: Particle[] = [];
    const colors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899'];
    const particleCount = 8;

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
      const velocity = 2 + Math.random() * 3;
      newParticles.push({
        id: `particle-${Date.now()}-${i}-${Math.random()}`,
        x,
        y,
        color: colors[Math.floor(Math.random() * colors.length)],
        angle,
        velocity,
        life: 1.0
      });
    }

    setParticles(prev => {
      const combined = [...prev, ...newParticles];
      // 限制粒子数量，最多30个（性能优化）
      return combined.slice(-30);
    });

    setClickCount(prev => prev + 1);
    // 使用 setTimeout 避免阻塞主线程
    if (onInteraction) {
      setTimeout(() => onInteraction(), 0);
    }
  }, [onInteraction]);

  // 点击处理
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    createParticles(x, y);
  }, [createParticles]);

  // 粒子动画循环 - 优化性能
  useEffect(() => {
    let lastTime = performance.now();
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;

      // 限制帧率，避免过度渲染
      if (deltaTime >= frameInterval) {
        setParticles(prev => {
          // 如果没有粒子，跳过更新
          if (prev.length === 0) return prev;

          return prev
            .map(particle => {
              const newX = particle.x + Math.cos(particle.angle) * particle.velocity;
              const newY = particle.y + Math.sin(particle.angle) * particle.velocity;
              const newLife = particle.life - 0.02;
              const newVelocity = particle.velocity * 0.95;

              if (newLife <= 0 || newVelocity < 0.1) {
                return null;
              }

              return {
                ...particle,
                x: newX,
                y: newY,
                life: newLife,
                velocity: newVelocity
              };
            })
            .filter((p): p is Particle => p !== null);
        });

        lastTime = currentTime - (deltaTime % frameInterval);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // 小贴士轮播
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % learningTips.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [learningTips.length]);

  // 计算等待时间
  const getElapsedTime = () => {
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    if (elapsed < 10) return `${elapsed}秒`;
    return `${Math.floor(elapsed / 60)}分${elapsed % 60}秒`;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden bg-gradient-to-br from-rose-50/30 via-indigo-50/20 to-teal-50/30"
      onClick={handleClick}
    >
      {/* 粒子层 - 使用 transform 优化性能 */}
      <div className="absolute inset-0 pointer-events-none" style={{ willChange: 'transform' }}>
        {particles.map(particle => (
          <div
            key={particle.id}
            className="absolute w-2 h-2 rounded-full pointer-events-none"
            style={{
              left: 0,
              top: 0,
              transform: `translate(${particle.x}px, ${particle.y}px) scale(${particle.life})`,
              backgroundColor: particle.color,
              opacity: particle.life,
              transition: 'none',
              willChange: 'transform, opacity',
              boxShadow: `0 0 ${4 * particle.life}px ${particle.color}`
            }}
          />
        ))}
      </div>

      {/* 主要内容区域 */}
      <div className="relative z-10 flex flex-col items-center space-y-6 px-6">
        {/* 动画图标 */}
        <div className="relative">
          <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-indigo-100 rounded-full flex items-center justify-center animate-bounce shadow-lg">
            <Sparkles className="w-10 h-10 text-rose-500 animate-pulse" />
          </div>
          <div className="absolute -bottom-3 w-16 h-2 bg-rose-200 rounded-full blur-md opacity-50 left-1/2 -translate-x-1/2 animate-pulse"></div>
        </div>

        {/* 学习小贴士 */}
        <div className="max-w-md text-center">
          <div
            key={tipIndex}
            className="bg-white/80 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg border border-rose-100/50 animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <p className="text-slate-700 font-medium text-sm leading-relaxed">
              {learningTips[tipIndex]}
            </p>
          </div>
        </div>

        {/* 提示文字 */}
        <div className="flex flex-col items-center space-y-2">
          <p className="text-slate-400 font-medium text-sm animate-pulse">
            正在努力思考中...
          </p>
          <p className="text-xs text-slate-300">
            点击任意位置产生粒子效果 • 已等待 {getElapsedTime()}
          </p>
        </div>

        {/* 点击计数（可选，点击超过5次后显示） */}
        {clickCount > 5 && (
          <div className="absolute top-4 right-4 bg-white/60 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm animate-in fade-in zoom-in duration-300">
            ✨ {clickCount} 次点击
          </div>
        )}
      </div>

      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-rose-200/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-indigo-200/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-teal-200/10 rounded-full blur-2xl animate-pulse delay-2000"></div>
      </div>
    </div>
  );
};
