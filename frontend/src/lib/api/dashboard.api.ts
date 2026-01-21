import { fetchWithAuth } from './client';

export interface TrendPoint {
    date: string;
    income: number;
    expense: number;
}

export interface DashboardStats {
    total_balance: number;
    monthly_income: number;
    monthly_expense: number;
    trends: TrendPoint[];
}

export const dashboardApi = {
    getStats: (headers?: Record<string, string>): Promise<DashboardStats> =>
        fetchWithAuth('/stats/dashboard', { headers }),
};
