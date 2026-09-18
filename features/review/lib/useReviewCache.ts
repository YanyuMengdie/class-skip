import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { SavedArtifact, QuizRound, FlashCard } from '@/types';
import { loadReviewCache, saveReviewCache } from './reviewCache';
const merge = <T extends { id: string }>(cached: T[], current: T[]) => Array.from(new Map([...cached, ...current].map(v => [v.id, v])).values());
export function useReviewCache(owner: string, sourceKey: string, artifacts: SavedArtifact[], cards: FlashCard[], rounds: QuizRound[], setArtifacts: Dispatch<SetStateAction<SavedArtifact[]>>, setCards: Dispatch<SetStateAction<FlashCard[]>>, setRounds: Dispatch<SetStateAction<QuizRound[]>>) {
  const key = sourceKey ? `${owner}:${sourceKey}` : '';
  const [hydrated, setHydrated] = useState('');
  const [warning, setWarning] = useState('');
  useEffect(() => {
    let active = true;
    setWarning('');
    if (!key) return;
    loadReviewCache(key).then(cache => {
      if (!active) return;
      if (cache) {
        setArtifacts(prev => merge(cache.artifacts, prev));
        setCards(prev => merge(cache.cards, prev));
        setRounds(prev => merge(cache.rounds, prev));
      }
      setHydrated(key);
    }).catch(() => { if (active) setWarning('本机复习记录暂时无法读取，已有页面内容仍保留。请勿为了恢复记录重新生成。'); });
    return () => { active = false; };
  }, [key, setArtifacts, setCards, setRounds]);
  useEffect(() => {
    if (!key || hydrated !== key) return;
    const value = { key, artifacts: artifacts.filter(a => a.sourceKey === sourceKey), cards: cards.filter(c => c.sourceKey === sourceKey), rounds: rounds.filter(r => r.sourceKey === sourceKey) };
    if (!value.artifacts.length && !value.cards.length && !value.rounds.length) return;
    void saveReviewCache(value).catch(() => setWarning('本机复习记录未保存成功，请先保留当前页面。'));
  }, [key, sourceKey, hydrated, artifacts, cards, rounds]);
  return { warning, ready: !key || hydrated === key };
}
