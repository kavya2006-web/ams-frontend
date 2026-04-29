"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { listAttendanceRecords, type AttendanceRecord } from "@/lib/api/attendance-record";
import { getAttendanceSessionById, type AttendanceSession } from "@/lib/api/attendance-session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type SessionRow = {
  session: AttendanceSession | null;
  record: AttendanceRecord | null;
};

const getStatusBadge = (status?: string) => {
  if (status === "present") return { label: "Present", className: "bg-green-500/10 text-green-600 dark:text-green-400" };
  if (status === "absent") return { label: "Absent", className: "bg-red-500/10 text-red-600 dark:text-red-400" };
  if (status === "late") return { label: "Late", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" };
  if (status === "excused") return { label: "Excused", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" };
  return { label: "-", className: "bg-muted text-muted-foreground" };
};

const getStatusCell = (status?: string) => {
  if (status === "present") return { label: "P", className: "text-green-600 dark:text-green-400 font-semibold" };
  if (status === "absent") return { label: "A", className: "text-red-600 dark:text-red-400 font-semibold bg-red-50 dark:bg-red-950/20" };
  if (status === "late") return { label: "L", className: "text-yellow-600 dark:text-yellow-400 font-semibold" };
  if (status === "excused") return { label: "E", className: "text-blue-600 dark:text-blue-400 font-semibold" };
  return { label: "-", className: "text-muted-foreground" };
};

const isAttendedStatus = (status?: string) => status === "present" || status === "late" || status === "excused";

export default function StudentSubjectReportPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const subjectId = params.subjectId as string | undefined;

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      if (!user?._id || !subjectId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        let allRecords: AttendanceRecord[] = [];
        let page = 1;
        let totalPages = 1;

        do {
          const data = await listAttendanceRecords({ student: user._id, limit: 100, page });
          allRecords = [...allRecords, ...data.records];
          totalPages = data.pagination?.totalPages || 1;
          page += 1;
        } while (page <= totalPages);

        const subjectRecords = allRecords.filter(
          (record) => record.session?.subject?._id === subjectId
        );

        const recordsBySession = new Map<string, AttendanceRecord>();
        subjectRecords.forEach((record) => {
          if (record.session?._id) {
            recordsBySession.set(record.session._id, record);
          }
        });

        const sessionIds = Array.from(recordsBySession.keys());
        const sessions = await Promise.all(
          sessionIds.map((id) => getAttendanceSessionById(id))
        );

        const sessionsById = new Map<string, AttendanceSession>();
        sessions.forEach((session) => sessionsById.set(session._id, session));

        const reportRows: SessionRow[] = sessionIds.map((id) => ({
          session: sessionsById.get(id) ?? null,
          record: recordsBySession.get(id) ?? null,
        }));

        reportRows.sort((a, b) => {
          const aDate = a.session?.start_time || a.record?.marked_at;
          const bDate = b.session?.start_time || b.record?.marked_at;
          if (!aDate || !bDate) return 0;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });

        setRows(reportRows);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load attendance report");
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [user?._id, subjectId]);

  const summary = useMemo(() => {
    const total = rows.length;
    const attended = rows.filter((row) => isAttendedStatus(row.record?.status)).length;
    const percentage = total > 0 ? Math.round((attended / total) * 100) : 0;

    const subjectName =
      rows.find((row) => row.session?.subject?.name)?.session?.subject?.name ||
      rows.find((row) => row.record?.session?.subject?.name)?.record?.session?.subject?.name ||
      "Subject";

    const batchName =
      rows.find((row) => row.session?.batch?.name)?.session?.batch?.name ||
      rows.find((row) => row.record?.session?.batch?.name)?.record?.session?.batch?.name ||
      "Batch";

    return { total, attended, percentage, subjectName, batchName };
  }, [rows]);

  const sessionData = useMemo(() => {
    const sessions = rows
      .map((row) => row.session)
      .filter((session): session is AttendanceSession => Boolean(session))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const statusBySession = new Map<string, string | undefined>();
    rows.forEach((row) => {
      if (row.session?._id) {
        statusBySession.set(row.session._id, row.record?.status);
      }
    });

    return { sessions, statusBySession };
  }, [rows]);

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Attendance Report</h1>
          <p className="text-muted-foreground text-sm">Detailed view for this subject</p>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-[280px] text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No attendance records found for this subject.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{summary.subjectName}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
              <div>Batch: {summary.batchName}</div>
              <div>
                {summary.attended} / {summary.total} classes attended ({summary.percentage}%)
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border shadow-sm flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse m-0 p-0">
                <thead className="text-muted-foreground font-medium text-xs">
                  <tr>
                    <th colSpan={sessionData.sessions.length + 2} className="px-4 py-3 border-none font-normal bg-muted">
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subject</span>
                          <span className="text-sm font-semibold text-foreground">{summary.subjectName}</span>
                        </div>
                        <div className="hidden md:block w-px h-4 bg-border"></div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Batch</span>
                          <span className="text-sm font-semibold text-foreground">{summary.batchName}</span>
                        </div>
                      </div>
                    </th>
                  </tr>
                  <tr className="uppercase bg-muted">
                    <th className="px-4 py-3 border-b sticky left-0 z-20 bg-muted min-w-[200px]">Student Name</th>
                    {sessionData.sessions.map((session) => (
                      <th key={session._id} className="px-2 py-3 border-b text-center min-w-[60px] bg-muted">
                        <div className="flex flex-col items-center">
                          <span>{format(new Date(session.start_time), "dd/MM")}</span>
                        </div>
                      </th>
                    ))}
                    <th className="px-4 py-3 border-b text-center sticky right-0 z-20 bg-muted shadow-[-4px_0_12px_rgba(0,0,0,0.05)]">Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr className="hover:bg-muted/20">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-background group-hover:bg-muted/20 font-medium">
                      <div className="flex flex-col">
                        <span className="text-foreground">
                          {user?.name || `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "Student"}
                        </span>
                        <span className="text-xs text-muted-foreground w-[120px] overflow-hidden text-ellipsis whitespace-nowrap block" dir="rtl" style={{ textAlign: "left" }}>
                          {(user?.profile as { candidate_code?: string } | undefined)?.candidate_code || user?.adm_number || user?.email || user?._id}
                        </span>
                      </div>
                    </td>
                    {sessionData.sessions.map((session) => {
                      const status = sessionData.statusBySession.get(session._id);
                      const cell = getStatusCell(status);
                      return (
                        <td key={session._id} className={`px-2 py-3 text-center border-l border-muted/50 ${cell.className}`}>
                          {cell.label}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center font-bold sticky right-0 z-10 bg-background shadow-[-4px_0_12px_rgba(0,0,0,0.05)]">
                      <span className={summary.percentage < 75 ? "text-red-600" : summary.percentage >= 90 ? "text-green-600" : ""}>
                        {summary.percentage}%
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {rows.map((row) => {
                const status = row.record?.status;
                const badge = getStatusBadge(status);
                const startTime = row.session?.start_time || row.record?.marked_at;
                const endTime = row.session?.end_time;

                return (
                  <div key={row.session?._id || row.record?._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-muted/30 pb-2">
                    <div className="text-muted-foreground">
                      {startTime ? format(new Date(startTime), "MMM dd, yyyy") : "-"}
                      {startTime && endTime && (
                        <span className="ml-2">
                          {format(new Date(startTime), "hh:mm a")} - {format(new Date(endTime), "hh:mm a")}
                        </span>
                      )}
                    </div>
                    <Badge className={badge.className}>{badge.label}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
