// Temporarily hide unfinished features without deleting their implementation or data.
export const dashboardFeatures: Record<'energy' | 'growth' | 'profile', boolean> = {
  energy: false,
  growth: false,
  profile: false,
};

export function isDashboardFeatureVisible(tab: string): boolean {
  return !Object.prototype.hasOwnProperty.call(dashboardFeatures, tab)
    || dashboardFeatures[tab as keyof typeof dashboardFeatures];
}
