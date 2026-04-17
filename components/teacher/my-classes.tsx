"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Users, Calendar, Clock } from "lucide-react";
import {
  getRecentUniqueSessions,
  listAttendanceSessions,
  type AttendanceSession,
  type UniqueSession,
} from "@/lib/api/attendance-session";
import { format } from "date-fns";
import QuickStartDialog from "./quick-start-dialog";
import { useAuth } from "@/lib/auth-context";

interface MyClassesProps {
  onSessionCreated?: () => void;
}

export default function MyClasses({ onSessionCreated }: MyClassesProps) {
  const { user } = useAuth();
  const [classes, setClasses] = useState<UniqueSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<UniqueSession | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const normalizeSubjectCode = (subject: unknown): string | null => {
    const s = (subject ?? {}) as {
      subject_code?: string | number | null;
      code?: string | number | null;
      subjectCode?: string | number | null;
    };

    const raw = s.subject_code ?? s.code ?? s.subjectCode;
    const value = String(raw ?? "").trim();
    if (!value || value === "0" || value === "null" || value === "undefined") {
      return null;
    }

    return value.toUpperCase();
  };

  const normalizeSemesterLabel = (subject: unknown): string => {
    const s = (subject ?? {}) as {
      sem?: string | number | null;
      semester?: string | number | null;
      sem_no?: string | number | null;
      semNo?: string | number | null;
    };

    const raw = s.sem ?? s.semester ?? s.sem_no ?? s.semNo;
    const value = String(raw ?? "").trim();

    if (!value || value === "0" || value === "-" || value === "null" || value === "undefined") {
      return "-";
    }

    const digits = value.match(/\d+/)?.[0];
    if (digits) return `S${digits}`;

    return value.toUpperCase().startsWith("S") ? value.toUpperCase() : `S${value.toUpperCase()}`;
  };

  const sanitizeUniqueSession = (item: UniqueSession): UniqueSession => {
    const normalizedCode = normalizeSubjectCode(item.subject) ?? "";
    const normalizedSem = normalizeSemesterLabel(item.subject);

    return {
      ...item,
      subject: {
        ...item.subject,
        subject_code: normalizedCode,
        sem: normalizedSem,
      },
    };
  };

  const loadClassesFromSessionsFallback = async (): Promise<UniqueSession[]> => {
    if (!user?.email) return [];

    let allSessions: AttendanceSession[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const response = await listAttendanceSessions({ page, limit: 100 });
      allSessions = [...allSessions, ...response.sessions];
      totalPages = response.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);

    const teacherSessions = allSessions.filter((session) => {
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

    const groups = new Map<string, UniqueSession>();

    teacherSessions.forEach((session) => {
      const batchId = session.batch?._id;
      const subjectId = session.subject?._id;
      if (!batchId || !subjectId) return;

      const key = `${batchId}-${subjectId}`;
      const existing = groups.get(key);
      const latestSession = existing
        ? (new Date(session.start_time) > new Date(existing.latestSession) ? session.start_time : existing.latestSession)
        : session.start_time;

      groups.set(key, {
        batch: {
          _id: batchId,
          name: session.batch.name,
          department: (session.batch as unknown as { department?: string }).department || "",
          adm_year: Number((session.batch as unknown as { adm_year?: number; year?: number }).adm_year || session.batch.year || 0),
        },
        subject: {
          _id: subjectId,
          name: session.subject.name,
          subject_code: (session.subject as unknown as { subject_code?: string; code?: string }).subject_code || session.subject.code,
          sem: String((session.subject as unknown as { sem?: string | number }).sem || "-"),
          type: String((session.subject as unknown as { type?: string }).type || session.session_type || "regular"),
        },
        sessionCount: (existing?.sessionCount || 0) + 1,
        latestSession,
      });
    });

    return Array.from(groups.values()).sort(
      (a, b) => new Date(b.latestSession).getTime() - new Date(a.latestSession).getTime()
    );
  };

  const loadClasses = async () => {
    setLoading(true);
    try {
      const data = await getRecentUniqueSessions();
      if (data.length > 0) {
        setClasses(data.map(sanitizeUniqueSession));
      } else {
        const fallbackData = await loadClassesFromSessionsFallback();
        setClasses(fallbackData.map(sanitizeUniqueSession));
      }
    } catch (error) {
      console.error("Failed to load classes:", error);
      try {
        const fallbackData = await loadClassesFromSessionsFallback();
        setClasses(fallbackData.map(sanitizeUniqueSession));
      } catch (fallbackError) {
        console.error("My Classes fallback failed:", fallbackError);
        setClasses([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClasses();
  }, [user?._id, user?.email]);

  const handleClassClick = (classItem: UniqueSession) => {
    setSelectedClass(classItem);
    setDialogOpen(true);
  };

  const handleSessionCreated = () => {
    loadClasses();
    onSessionCreated?.();
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold">My Classes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Click on a class to start a new session
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="rounded-full bg-muted p-3 mb-4">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No classes found</h3>
              <p className="text-sm text-muted-foreground text-center">
                You haven&apos;t created any attendance sessions yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((classItem) => {
              const key = `${classItem.batch._id}-${classItem.subject._id}`;
              const subjectCode = normalizeSubjectCode(classItem.subject);
              const semesterLabel = normalizeSemesterLabel(classItem.subject);
              return (
                <Card
                  key={key}
                  className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary"
                  onClick={() => handleClassClick(classItem)}
                >
                  <CardContent className="space-y-3">
                    {/* Subject */}
                    <div className="flex gap-2">
                      <BookOpen className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                        <h3 className="font-semibold min-w-0 text-base leading-tight truncate">
                          {classItem.subject.name}
                        </h3>
                      {subjectCode ? (
                        <p className="text-xs flex items-center justify-center text-muted-foreground">
                          ({subjectCode})
                        </p>
                      ) : null}
                    </div>

                    {/* Batch */}
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">
                        {classItem.batch.name}
                      </span>
                      <Badge variant="outline" className="ml-auto shrink-0">
                        {semesterLabel}
                      </Badge>
                    </div>

                    {/* Last Session Info */}
                    <div className="flex flex-row items-center gap-4 pt-2 border-t justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          Last: {format(new Date(classItem.latestSession), "MMM dd, hh:mm a")}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {classItem.sessionCount} {classItem.sessionCount === 1 ? "session" : "sessions"} conducted
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <QuickStartDialog
        session={selectedClass}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSessionCreated={handleSessionCreated}
      />
    </>
  );
}
