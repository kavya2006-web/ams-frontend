"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import GreetingHeader from "@/components/student/greeting-header";
import ClassAttendanceOverview from "@/components/teacher/class-attendance-overview";
import TeacherNotifications from "@/components/teacher/teacher-notifications";
import MyClasses from "@/components/teacher/my-classes";
import { listAttendanceSessions } from "@/lib/api/attendance-session";
import { listAttendanceRecords } from "@/lib/api/attendance-record";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

type TeacherAttendanceCard = {
    className: string;
    classCode: string;
    totalClasses: number;
    averageAttendance: number;
    trend: "up" | "down" | "stable";
};

type TeacherNotificationItem = {
    id: string;
    title: string;
    message: string;
    type: "info" | "warning" | "success" | "announcement";
    postedBy: string;
    postedAt: Date;
    targetClass?: string;
};

export default function TeacherHome() {
    const { user } = useAuth();
    const [attendanceData, setAttendanceData] = useState<TeacherAttendanceCard[]>([]);
    const [notifications, setNotifications] = useState<TeacherNotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadTeacherDashboard = async () => {
            if (!user?.email) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                let allSessions: Awaited<ReturnType<typeof listAttendanceSessions>>["sessions"] = [];
                let page = 1;
                let totalPages = 1;

                do {
                    const response = await listAttendanceSessions({ page, limit: 100 });
                    allSessions = [...allSessions, ...response.sessions];
                    totalPages = response.pagination?.totalPages || 1;
                    page += 1;
                } while (page <= totalPages);

                const teacherSessionsFiltered = allSessions.filter((session) => {
                    const creator = session.created_by as unknown as
                        | string
                        | {
                            _id?: string;
                            email?: string;
                            user?: {
                                _id?: string;
                                email?: string;
                            };
                        }
                        | undefined;

                    const createdByUserId =
                        typeof creator === "string"
                            ? creator
                            : (creator?.user?._id || creator?._id);

                    const createdByEmail =
                        typeof creator === "string"
                            ? undefined
                            : (creator?.user?.email || creator?.email)?.toLowerCase();

                    if (user._id && createdByUserId) {
                        return createdByUserId === user._id;
                    }

                    return createdByEmail === user.email.toLowerCase();
                });

                const hasCreatorMetadata = allSessions.some((session) => {
                    const creator = session.created_by as unknown as
                        | string
                        | {
                            _id?: string;
                            email?: string;
                            user?: {
                                _id?: string;
                                email?: string;
                            };
                        }
                        | undefined;

                    if (typeof creator === "string") return true;
                    return Boolean(creator?._id || creator?.email || creator?.user?._id || creator?.user?.email);
                });

                const teacherSessions =
                    teacherSessionsFiltered.length === 0 && allSessions.length > 0 && !hasCreatorMetadata
                        ? allSessions
                        : teacherSessionsFiltered;

                if (teacherSessions.length === 0) {
                    setAttendanceData([]);
                    setNotifications([]);
                    setLoading(false);
                    return;
                }

                const sessionRecordStats = await Promise.all(
                    teacherSessions.map(async (session) => {
                        let presentCount = 0;
                        let totalCount = 0;
                        let recPage = 1;
                        let recTotalPages = 1;

                        do {
                            const recordsRes = await listAttendanceRecords({
                                session: session._id,
                                page: recPage,
                                limit: 100,
                            });

                            recordsRes.records.forEach((record) => {
                                totalCount += 1;
                                if (record.status === "present") {
                                    presentCount += 1;
                                }
                            });

                            recTotalPages = recordsRes.pagination?.totalPages || 1;
                            recPage += 1;
                        } while (recPage <= recTotalPages);

                        const percentage = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 0;

                        return {
                            session,
                            percentage,
                            totalCount,
                        };
                    })
                );

                const subjectAggregation = new Map<
                    string,
                    {
                        className: string;
                        classCode: string;
                        totalClasses: number;
                        present: number;
                        total: number;
                        sessionStats: Array<{ startTime: string; percentage: number }>;
                    }
                >();

                sessionRecordStats.forEach(({ session, percentage, totalCount }) => {
                    if (!session.subject?._id) return;

                    const key = session.subject._id;
                    const current = subjectAggregation.get(key) ?? {
                        className: session.subject.name,
                        classCode: session.subject.code,
                        totalClasses: 0,
                        present: 0,
                        total: 0,
                        sessionStats: [],
                    };

                    current.totalClasses += 1;
                    current.total += totalCount;
                    current.present += Math.round((percentage / 100) * totalCount);
                    current.sessionStats.push({
                        startTime: session.start_time,
                        percentage,
                    });

                    subjectAggregation.set(key, current);
                });

                const nextAttendanceData: TeacherAttendanceCard[] = Array.from(subjectAggregation.values())
                    .map((item) => {
                        const averageAttendance = item.total > 0 ? Math.round((item.present / item.total) * 100) : 0;

                        const sortedStats = [...item.sessionStats].sort(
                            (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
                        );

                        let trend: "up" | "down" | "stable" = "stable";
                        if (sortedStats.length >= 2) {
                            const recent = sortedStats[0].percentage;
                            const previous = sortedStats[1].percentage;
                            if (recent > previous + 2) trend = "up";
                            else if (recent < previous - 2) trend = "down";
                        }

                        return {
                            className: item.className,
                            classCode: item.classCode,
                            totalClasses: item.totalClasses,
                            averageAttendance,
                            trend,
                        };
                    })
                    .sort((a, b) => a.className.localeCompare(b.className));

                const nextNotifications: TeacherNotificationItem[] = teacherSessions
                    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                    .slice(0, 5)
                    .map((session) => ({
                        id: session._id,
                        title: `Session conducted for ${session.subject.name}`,
                        message: `Attendance session for ${session.batch.name} was conducted at ${new Date(session.start_time).toLocaleString()}.`,
                        type: "info",
                        postedBy: user.first_name || user.name || "Teacher",
                        postedAt: new Date(session.createdAt || session.start_time),
                        targetClass: session.subject.code,
                    }));

                setAttendanceData(nextAttendanceData);
                setNotifications(nextNotifications);
            } catch (err) {
                console.error("Failed to load teacher dashboard:", err);
                setError(err instanceof Error ? err.message : "Failed to load dashboard data");
                setAttendanceData([]);
                setNotifications([]);
            } finally {
                setLoading(false);
            }
        };

        loadTeacherDashboard();
    }, [user?._id, user?.email]);

    return (
        <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6">
            {/* Greeting Header */}
            <GreetingHeader userName={user?.first_name || user?.name || "Teacher"} />

            {/* My Classes Section - Quick Start */}
            <MyClasses />

            {error && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {/* Main Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Analytics */}
                <div className="space-y-6">
                    {loading ? (
                        <Skeleton className="h-[420px] w-full" />
                    ) : (
                        <ClassAttendanceOverview attendance={attendanceData} />
                    )}
                </div>

                {/* Right Column - Notifications */}
                <div className="space-y-6">
                    {loading ? (
                        <Skeleton className="h-[420px] w-full" />
                    ) : (
                        <TeacherNotifications
                            notifications={notifications}
                            teacherName={user?.first_name || user?.name || "Teacher"}
                        />
                    )}
        </div>
            </div>
        </div>
    );
}
