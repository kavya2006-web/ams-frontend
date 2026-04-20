"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, Clock, Users, BookOpen, Pencil, Trash2, Filter, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth-context";
import { listAttendanceSessions, deleteAttendanceSessionById, type AttendanceSession } from "@/lib/api/attendance-session";
import CreateClassDialog from "./create-class-dialog";

type ClassFilterItem = {
  batch: {
    _id: string;
    name: string;
  };
  subject: {
    _id: string;
    name: string;
  };
};

export default function AttendancePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [uniqueClasses, setUniqueClasses] = useState<ClassFilterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogSession, setDeleteDialogSession] = useState<AttendanceSession | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const extractYearFromBatch = (batch: AttendanceSession["batch"]): string | null => {
    const normalizeTwoDigitYear = (yy: string) => {
      const n = Number(yy);
      const fullYear = n <= 49 ? 2000 + n : 1900 + n;
      return String(fullYear);
    };

    const raw = batch as unknown as {
      year?: number;
      adm_year?: number;
      id?: string;
      code?: string;
      name?: string;
    };

    if (raw.year) return String(raw.year);
    if (raw.adm_year) return String(raw.adm_year);

    const idOrCode = raw.id || raw.code;
    const yy = idOrCode?.match(/^(\d{2})/)?.[1];
    if (yy) {
      return normalizeTwoDigitYear(yy);
    }

    // Handles forms like CSE24A or IT24 where year appears before a trailing letter.
    const yyFromIdOrCodeAnywhere = idOrCode?.match(/(\d{2})(?=[A-Za-z])/i)?.[1];
    if (yyFromIdOrCodeAnywhere) {
      return normalizeTwoDigitYear(yyFromIdOrCodeAnywhere);
    }

    const yearFromName = raw.name?.match(/(20\d{2})/)?.[1];
    if (yearFromName) return yearFromName;

    // Handles forms like 24CSE-A in batch name.
    const yyFromNamePrefix = raw.name?.trim().match(/^(\d{2})(?=[A-Za-z])/i)?.[1];
    if (yyFromNamePrefix) {
      return normalizeTwoDigitYear(yyFromNamePrefix);
    }

    return null;
  };

  useEffect(() => {
    if (user?.email) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user?.email]);

  const buildUniqueClassesFromSessions = (teacherSessions: AttendanceSession[]): ClassFilterItem[] => {
    const map = new Map<string, ClassFilterItem>();

    teacherSessions.forEach((session) => {
      const key = `${session.batch._id}-${session.subject._id}`;
      if (!map.has(key)) {
        map.set(key, {
          batch: {
            _id: session.batch._id,
            name: session.batch.name,
          },
          subject: {
            _id: session.subject._id,
            name: session.subject.name,
          },
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const subjectCompare = a.subject.name.localeCompare(b.subject.name);
      if (subjectCompare !== 0) return subjectCompare;
      return a.batch.name.localeCompare(b.batch.name);
    });
  };

  const filterTeacherSessions = (allSessions: AttendanceSession[]): AttendanceSession[] => {
    const currentUserId = user?._id;
    const currentTeacherEmail = user?.email?.toLowerCase();
    if (!currentUserId && !currentTeacherEmail) return [];

    const filtered = allSessions.filter((session) => {
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

      if (currentUserId && createdByUserId) {
        return createdByUserId === currentUserId;
      }
      return Boolean(currentTeacherEmail && createdByEmail === currentTeacherEmail);
    });

    // If backend doesn't include creator metadata in list response, avoid blank page.
    if (filtered.length === 0 && allSessions.length > 0) {
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

      if (!hasCreatorMetadata) {
        return allSessions;
      }
    }

    return filtered;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      let allSessions: AttendanceSession[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const sessionsData = await listAttendanceSessions({ limit: 100, page });
        allSessions = [...allSessions, ...sessionsData.sessions];
        totalPages = sessionsData.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);

      const teacherSessions = filterTeacherSessions(allSessions);
      setSessions(teacherSessions);
      setUniqueClasses(buildUniqueClassesFromSessions(teacherSessions));
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      let allSessions: AttendanceSession[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const data = await listAttendanceSessions({ limit: 100, page });
        allSessions = [...allSessions, ...data.sessions];
        totalPages = data.pagination?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);

      const teacherSessions = filterTeacherSessions(allSessions);
      setSessions(teacherSessions);
      setUniqueClasses(buildUniqueClassesFromSessions(teacherSessions));
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  };

  const getFilteredSessions = () => {
    let filtered = sessions;

    if (selectedClass !== "all") {
      const [batchId, subjectId] = selectedClass.split("-");
      filtered = filtered.filter(
        (session) => session.batch._id === batchId && session.subject._id === subjectId
      );
    }

    if (selectedYear !== "all") {
      filtered = filtered.filter((session) => {
        const year = extractYearFromBatch(session.batch);
        return year === selectedYear;
      });
    }

    return filtered;
  };

  const filteredSessions = getFilteredSessions();

  const availableYears = useMemo(() => {
    const years = new Set<string>();

    sessions.forEach((session) => {
      const year = extractYearFromBatch(session.batch);
      if (year) years.add(year);
    });

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [sessions]);

  const groupedSessions = useMemo(() => {
    const groups = new Map<
      string,
      {
        groupKey: string;
        subjectName: string;
        subjectCode: string;
        batchName: string;
        sessions: AttendanceSession[];
      }
    >();

    filteredSessions.forEach((session) => {
      const groupKey = `${session.subject._id}-${session.batch._id}`;
      const existing = groups.get(groupKey);

      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.set(groupKey, {
          groupKey,
          subjectName: session.subject.name,
          subjectCode: session.subject.code,
          batchName: session.batch?.name ?? "N/A",
          sessions: [session],
        });
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        sessions: [...group.sessions].sort(
          (a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        ),
      }))
      .sort((a, b) => {
        const subjectCompare = a.subjectName.localeCompare(b.subjectName);
        if (subjectCompare !== 0) return subjectCompare;
        return a.batchName.localeCompare(b.batchName);
      });
  }, [filteredSessions]);

  const handleDelete = async (sessionId: string) => {
    try {
      await deleteAttendanceSessionById(sessionId);
      await loadSessions();
      setDeleteDialogSession(null);
    } catch (error) {
      console.error("Failed to delete session:", error);
      alert(error instanceof Error ? error.message : "Failed to delete session");
    }
  };

  const getSessionTypeBadge = (type: string) => {
    const variants = {
      regular: "default",
      extra: "secondary",
      practical: "outline",
    } as const;
    return variants[type as keyof typeof variants] || "default";
  };

  return (
    <div className="min-h-screen p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Attendance Management</h1>
          <p className="text-muted-foreground mt-1">
            Manage attendance sessions and records
          </p>
        </div>
        <CreateClassDialog onClassCreated={loadSessions} />
      </div>

      {/* Filter by Class */}
      {!loading && uniqueClasses.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filter by Class:</span>
          </div>
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-75">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {uniqueClasses.map((classItem) => {
                const key = `${classItem.batch._id}-${classItem.subject._id}`;
                return (
                  <SelectItem key={key} value={key}>
                    {classItem.subject.name} - {classItem.batch.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {selectedClass !== "all" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedClass("all")}
            >
              Clear Filter
            </Button>
          )}
        </div>
      )}

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription className="mt-1">
                {selectedClass === "all" 
                  ? "All attendance sessions created by you" 
                  : "Filtered by selected class"}
              </CardDescription>
            </div>
            {!loading && (
              <Badge variant="outline" className="text-base px-3 py-1">
                {filteredSessions.length} {filteredSessions.length === 1 ? "session" : "sessions"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!loading && availableYears.length > 0 && (
            <div className="mb-4">
              <Tabs value={selectedYear} onValueChange={setSelectedYear}>
                <TabsList className="h-auto flex-wrap justify-start">
                  <TabsTrigger value="all">All Years</TabsTrigger>
                  {availableYears.map((year) => (
                    <TabsTrigger key={year} value={year}>{year}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {selectedClass === "all" && selectedYear === "all"
                  ? "No sessions found"
                  : "No sessions for selected filters"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {selectedClass === "all" && selectedYear === "all"
                  ? "Create a new class to start taking attendance"
                  : "No attendance sessions match the selected class/year filters."}
              </p>
              {selectedClass === "all" && selectedYear === "all" && <CreateClassDialog onClassCreated={loadSessions} />}
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSessions.map((group) => (
                <details key={group.groupKey} className="rounded-md border bg-card group">
                  <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold truncate">{group.subjectName}</span>
                      <span className="text-muted-foreground">-</span>
                      <span className="text-sm text-muted-foreground truncate">{group.batchName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {group.sessions.length} {group.sessions.length === 1 ? "session" : "sessions"}
                      </Badge>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                    </div>
                  </summary>

                  <div className="px-4 pb-4">
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="hidden sm:table-cell">Duration</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.sessions.map((session) => (
                            <TableRow
                              key={session._id}
                              className="hover:bg-muted/50 cursor-pointer"
                              onClick={() => router.push(`/dashboard/attendance/session/${session._id}`)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2 text-sm">
                                  <Clock className="h-4 w-4 text-muted-foreground" />
                                  <span>
                                    {format(new Date(session.start_time), "MMM dd, hh:mm a")} -{" "}
                                    {format(new Date(session.end_time), "hh:mm a")}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={getSessionTypeBadge(session.session_type)}>
                                  {session.session_type.charAt(0).toUpperCase() + session.session_type.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                                {session.hours_taken} {session.hours_taken === 1 ? "hour" : "hours"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Edit"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      alert("Edit functionality coming soon!");
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    title="Delete"
                                    className="text-destructive hover:text-destructive"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteDialogSession(session);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      {deleteDialogSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle>Delete Session</CardTitle>
              <CardDescription>
                Are you sure you want to delete this attendance session? This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-3 rounded-lg">
                <p className="font-medium">{deleteDialogSession.subject.name}</p>
                <p className="text-sm text-muted-foreground">
                  {deleteDialogSession.batch?.name ?? "N/A"} • {format(new Date(deleteDialogSession.start_time), "MMM dd, yyyy hh:mm a")}
                </p>
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <Button variant="outline" onClick={() => setDeleteDialogSession(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => handleDelete(deleteDialogSession._id)}>
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Create a class session to start taking attendance</p>
          <p>• Each session is linked to a specific batch and subject</p>
          <p>• You can mark attendance for all students in the session</p>
          <p>• Sessions are automatically timestamped</p>
        </CardContent>
      </Card>
    </div>
  );
}
