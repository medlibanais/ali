// Shared client-side models. These map 1:1 to Supabase rows; the old
// axios client is gone, screens keep importing types from here.

import type { Pillar } from '../theme/tokens';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Quest {
  quest_id: string;
  predefined_id: string | null;
  pillar: Pillar;
  title: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  xp_reward: number;
  is_ai_generated: boolean;
  why_this_matters: string | null;
  time_estimate_minutes: number | null;
  assigned_date: string;
  completed: boolean;
  completed_at: string | null;
  skipped: boolean;
  priority: number;
}

export interface DailyQuestsResponse {
  date: string;
  daily_life_score: number;
  pillars: Partial<Record<Pillar, number>>;
  quests: Quest[];
}

export interface CompleteQuestResponse {
  quest_id: string;
  xp_awarded: number;
  time_bonus?: number;
  streak_bonus?: number;
  total_xp: number;
  level: number;
  level_up: boolean;
  daily_score: number;
  current_streak: number;
  best_streak: number;
  new_badges: string[];
}

export interface UndoQuestResponse {
  quest_id: string;
  xp_refunded: number;
  total_xp: number;
}

export interface SkipQuestResponse {
  quest_id: string;
  skipped: boolean;
  skips_used: number;
}

export interface Achievement {
  badge_id: string;
  badge_name: string;
  description: string;
  rarity: Rarity;
  xp_reward: number;
  unlocked_at: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback: -1 | 0 | 1;
  timestamp: string;
}

// ---- Analytics (computed client-side from daily_scores) ----

export interface PillarDayDetail {
  score: number;
  completed: number;
  total: number;
}

export interface DailyScoreResponse {
  date: string;
  overall_score: number;
  pillars: Partial<Record<Pillar, PillarDayDetail>>;
  suggestion: string | null;
}

export interface PillarTrend {
  score: number;
  trend: 'up' | 'down' | 'neutral';
  change_percent: number;
}

export interface WeeklyReportResponse {
  week: string;
  completion_rate: number;
  total_xp: number;
  pillar_scores: Partial<Record<Pillar, PillarTrend>>;
  ai_insights: string[];
  prediction: { next_week_score: number; confidence: number } | null;
}

export interface MonthlyReportResponse {
  month: string;
  completion_rate: number;
  completion_change_percent: number | null;
  average_daily_score: number;
  highest_daily_score: number;
  lowest_daily_score: number;
  total_xp: number;
  days_active: number;
  streaks: { best_streak: number };
  badges_unlocked: string[];
}
