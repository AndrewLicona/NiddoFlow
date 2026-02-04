import { Card } from "./Card";

export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-foreground/[0.05] rounded-lg ${className}`} />
    );
}

export function DashboardSkeleton() {
    return (
        <main className="max-w-6xl mx-auto p-4 md:p-8 pt-10 md:pt-8 space-y-6 md:space-y-10 min-h-screen pb-24">
            {/* Header Skeleton */}
            <div className="flex justify-between items-center mb-8">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <div className="flex space-x-2">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
            </div>

            {/* Summary Cards Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-8">
                <Skeleton className="col-span-2 md:col-span-1 h-32 rounded-3xl" />
                <Skeleton className="h-32 rounded-3xl" />
                <Skeleton className="h-32 rounded-3xl" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-10">
                <div className="lg:col-span-8 space-y-6 md:space-y-10">
                    <Skeleton className="h-40 rounded-3xl" /> {/* Smart Feed */}
                    <Skeleton className="h-[400px] rounded-3xl" /> {/* Chart */}
                </div>

                <div className="lg:col-span-4 space-y-6 md:space-y-10">
                    <Card variant="elevated">
                        <Skeleton className="h-6 w-32 mb-6" />
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-16 rounded-2xl" />
                            ))}
                        </div>
                    </Card>

                    <Card variant="elevated">
                        <Skeleton className="h-6 w-40 mb-6" />
                        <div className="space-y-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-14 rounded-xl" />
                            ))}
                        </div>
                    </Card>
                </div>
            </div>
        </main>
    );
}
