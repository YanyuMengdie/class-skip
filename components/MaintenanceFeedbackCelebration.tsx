import React from 'react';

interface Props {
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}

export const MaintenanceFeedbackCelebration: React.FC<Props> = ({
  title,
  body,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) => {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
      <h3 className="text-lg font-bold text-emerald-800">{title}</h3>
      <p className="text-sm text-emerald-700 leading-relaxed">{body}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPrimary}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="px-4 py-2 rounded-xl border border-emerald-300 text-emerald-800 text-sm font-medium"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
};
