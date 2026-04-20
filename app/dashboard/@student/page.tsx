"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import GreetingHeader from "@/components/student/greeting-header";
import AttendanceOverview from "@/components/student/attendance-overview";
import NotificationsList from "@/components/student/notifications-list";
import { listAttendanceRecords, type AttendanceRecord } from "@/lib/api/attendance-record";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

type SubjectAttendance = {
  subjectName: string;
  totalClasses: number;
  attendedClasses: number;
  percentage: number;
};

const dummyNotifications = [
  {
    id: "1",
    title: "Mid-Semester Exam Schedule Released",
    message: "Mid-semester exams will be conducted from December 20-27. Check your timetable for details.",
    type: "announcement" as const,
    postedBy: "Dr. Sarah Johnson",
    postedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    isRead: false,
  },
  {
    id: "2",
    title: "Lab Session Rescheduled",
    message: "Tomorrow's Database Lab is rescheduled to 2:00 PM instead of 10:00 AM.",
    type: "warning" as const,
    postedBy: "Prof. Michael Chen",
    postedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    isRead: false,
  },
];

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<SubjectAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        if (!user?._id) {
          throw new Error("User information not available");
        }

        // Fetch all attendance records with pagination (extracts subjects from records)
        let allRecords: AttendanceRecord[] = [];
        let recordPage = 1;
        let recordTotalPages = 1;
        do {
          const { records, pagination } = await listAttendanceRecords({
            student: user._id,
            limit: 100,
            page: recordPage,
          });
          allRecords = [...allRecords, ...records];
          recordTotalPages = pagination?.totalPages || 1;
          recordPage++;
        } while (recordPage <= recordTotalPages);

        if (!allRecords || allRecords.length === 0) {
          setAttendance([]);
          setLoading(false);
          return;
        }

        // Group attendance by subject name and code
        const attendanceBySubject = new Map<string, { present: number; total: number }>();

        allRecords.forEach((record) => {
          // Skip records without session or subject data
          if (!record.session || typeof record.session === 'string' || !record.session.subject) {
            console.warn("Skipping record with missing session/subject data:", record);
            return;
          }

          const subjectId = record.session.subject._id;
          const current = attendanceBySubject.get(subjectId);

          if (current) {
            current.total += 1;
            if (record.status === "present") {
              current.present += 1;
            }
          } else {
            attendanceBySubject.set(subjectId, {
              present: record.status === "present" ? 1 : 0,
              total: 1,
            });
          }
        });

        // Get unique subjects from records and calculate attendance
        const uniqueSubjectsMap = new Map<string, { name: string; code: string }>();
        allRecords.forEach((record) => {
          // Skip records without session or subject data
          if (!record.session || typeof record.session === 'string' || !record.session.subject) {
            return;
          }

          const subjectId = record.session.subject._id;
          if (!uniqueSubjectsMap.has(subjectId)) {
            uniqueSubjectsMap.set(subjectId, {
              name: record.session.subject.name,
              code: record.session.subject.code,
            });
          }
        });

        // Transform to SubjectAttendance format
        const attendanceData = Array.from(uniqueSubjectsMap.entries())
          .map(([subjectId, subject]) => {
            const stats = attendanceBySubject.get(subjectId) || { present: 0, total: 0 };
            const percentage = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0;

            return {
              subjectName: subject.name,
              totalClasses: stats.total,
              attendedClasses: stats.present,
              percentage,
            };
          })
          .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

        setAttendance(attendanceData);
        setError(null);
      } catch (err) {
        console.error("Error fetching attendance data:", err);
        setError(err instanceof Error ? err.message : "Failed to load attendance data");
        setAttendance([]);
      } finally {
        setLoading(false);
      }
    };

    if (user?._id) {
      fetchAttendanceData();
    } else {
      setLoading(false);
    }
  }, [user]);

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6">
      {/* Greeting Header */}
      <GreetingHeader userName={user?.first_name || user?.name || "Student"} />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ) : attendance.length > 0 ? (
            <AttendanceOverview attendance={attendance} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Attendance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No attendance data available yet.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <NotificationsList notifications={dummyNotifications} />
        </div>
      </div>
    </div>
  );
}