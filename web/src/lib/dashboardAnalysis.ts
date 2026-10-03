// First included business day, at midnight in Maldives (UTC+05:00).
export const DASHBOARD_ANALYSIS_START = Date.parse('2026-09-01T00:00:00+05:00');
export function dashboardAnalysisRecords<T extends {date:string}>(records:T[]):T[] {
  return records.filter(record => new Date(record.date).getTime() >= DASHBOARD_ANALYSIS_START);
}
