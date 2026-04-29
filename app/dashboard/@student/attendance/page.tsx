"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { type SubjectAttendanceStats } from "@/lib/api/attendance-stats";
import { listAttendanceRecords, type AttendanceRecord } from "@/lib/api/attendance-record";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const getAttendanceColor = (percentage: number) => {
  if (percentage >= 75) return "text-green-600 dark:text-green-400";
  if (percentage >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
};

const normalizeSemester = (value?: string | number) => {
  if (value === undefined || value === null || value === "") return "Unknown";
  return String(value).trim();
};

export default function StudentAttendancePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [attendance, setAttendance] = useState<SubjectAttendanceStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSemester, setSelectedSemester] = useState<string>("all");

  useEffect(() => {
    const buildSubjectStats = (records: AttendanceRecord[]): SubjectAttendanceStats[] => {
      const map = new Map<string, SubjectAttendanceStats>();

      records.forEach((record) => {
        const subject = record.session?.subject as {
          _id?: string;
          name?: string;
          code?: string;
          sem?: string | number;
          semester?: string | number;
        } | undefined;

        if (!subject?._id) return;

        const existing = map.get(subject._id);
        const attended = record.status === "present" || record.status === "late" || record.status === "excused";

        if (existing) {
          existing.totalClasses += 1;
          if (attended) existing.attendedClasses += 1;
          return;
        }

        map.set(subject._id, {
          subjectId: subject._id,
          subjectName: subject.name || "Subject",
          subjectCode: subject.code,
          sem: subject.sem,
          semester: subject.semester,
          totalClasses: 1,
          attendedClasses: attended ? 1 : 0,
          percentage: 0,
          classesNeeded: 0,
          classesCanSkip: 0,
        });
      });

      return Array.from(map.values()).map((item) => {
        const percentage = item.totalClasses > 0
          ? Math.round((item.attendedClasses / item.totalClasses) * 100)
          : 0;

        const neededRaw = 3 * item.totalClasses - 4 * item.attendedClasses;
        const classesNeeded = percentage >= 75 ? 0 : Math.max(0, Math.ceil(neededRaw));

        const skipRaw = (4 * item.attendedClasses - 3 * item.totalClasses) / 3;
        const classesCanSkip = percentage < 75 ? 0 : Math.max(0, Math.floor(skipRaw));

        return {
          ...item,
          percentage,
          classesNeeded,
          classesCanSkip,
        };
      });
    };

    const fetchAttendance = async () => {
      try {
        setLoading(true);
        let allRecords: AttendanceRecord[] = [];
        let page = 1;
        let totalPages = 1;

        do {
          const data = await listAttendanceRecords({ student: user?._id, limit: 100, page });
          allRecords = [...allRecords, ...data.records];
          totalPages = data.pagination?.totalPages || 1;
          page += 1;
        } while (page <= totalPages);

        const stats = buildSubjectStats(allRecords);
        setAttendance(stats);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load attendance data");
        setAttendance([]);
      } finally {
        setLoading(false);
      }
    };

    if (user?._id) {
      fetchAttendance();
    } else {
      setLoading(false);
    }
  }, [user?._id]);

  const semesters = useMemo(() => {
    const values = new Set<string>();
    attendance.forEach((item) => values.add(normalizeSemester(item.sem ?? item.semester)));
    const list = Array.from(values);

    return list.sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
        return aNum - bNum;
      }
      return a.localeCompare(b);
    });
  }, [attendance]);

  const filteredAttendance = useMemo(() => {
    if (selectedSemester === "all") return attendance;
    return attendance.filter((item) => normalizeSemester(item.sem ?? item.semester) === selectedSemester);
  }, [attendance, selectedSemester]);

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold">My Attendance</h1>
        <p className="text-muted-foreground">
          Track your subjects by semester and view detailed reports.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Subjects</CardTitle>
              <p className="text-sm text-muted-foreground">All attendance records for you</p>
            </div>
            
          </div>
        </CardHeader>
        <CardContent>
          {!loading && semesters.length > 0 && (
            <div className="mb-4">
              <Tabs value={selectedSemester} onValueChange={setSelectedSemester}>
                <TabsList className="h-auto flex-wrap justify-start">
                  <TabsTrigger value="all">All Sems</TabsTrigger>
                  {semesters.map((semester) => (
                    <TabsTrigger key={semester} value={semester}>S{semester}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredAttendance.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <GraduationCap className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No subjects found</h3>
              <p className="text-muted-foreground">Try another semester filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAttendance.map((subject) => {
                const semester = normalizeSemester(subject.sem ?? subject.semester);
                return (
                  <div
                    key={subject.subjectId ?? `${subject.subjectName}-${semester}`}
                    className="rounded-md border bg-card"
                  >
                    <div
                      className="px-4 py-3 flex items-start justify-between gap-4 cursor-pointer"
                      role="button"
                      tabIndex={subject.subjectId ? 0 : -1}
                      onClick={() => subject.subjectId && router.push(`/dashboard/attendance/report/${subject.subjectId}`)}
                      onKeyDown={(event) => {
                        if (!subject.subjectId) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/dashboard/attendance/report/${subject.subjectId}`);
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{subject.subjectName}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>S{semester}</span>
                              {subject.subjectCode && <span>• {subject.subjectCode}</span>}
                            </div>
                          </div>
                          <span className={`text-sm font-semibold ${getAttendanceColor(subject.percentage)}`}>
                            {subject.percentage}%
                          </span>
                        </div>
                        <div className="mt-2">
                          <Progress value={subject.percentage} className="h-2" />
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {subject.attendedClasses} / {subject.totalClasses} classes
                            </span>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!subject.subjectId}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (subject.subjectId) {
                                  router.push(`/dashboard/attendance/report/${subject.subjectId}`);
                                }
                              }}
                            >
                              View Report
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
