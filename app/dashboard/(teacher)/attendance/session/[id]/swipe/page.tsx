"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import TinderCard from "react-tinder-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Check, X, RotateCcw, Save } from "lucide-react";
import { getAttendanceSessionById, type AttendanceSession } from "@/lib/api/attendance-session";
import { listUsers } from "@/lib/api/user";
import { createBulkAttendanceRecords, listAttendanceRecords, updateAttendanceRecordById, type AttendanceStatus, type AttendanceRecord } from "@/lib/api/attendance-record";
import type { User } from "@/lib/types/UserTypes";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

// Define an interface directly from react-tinder-card API for the ref mapping
interface TinderCardAPI {
  swipe(dir?: string): Promise<void>;
  restoreCard(): Promise<void>;
}

export default function SwipeAttendancePage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Stack of records we have marked thus far
  const [markedRecords, setMarkedRecords] = useState<Array<{ studentId: string; status: AttendanceStatus }>>([]);
  
  // Track the current index for UI purposes 
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [existingRecords, setExistingRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [lastSwipeDirection, setLastSwipeDirection] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const sessionData = await getAttendanceSessionById(sessionId);
        setSession(sessionData);

        const sessionBatchId = typeof sessionData.batch === 'string' ? sessionData.batch : sessionData.batch?._id;
        
        let allStudents: User[] = [];
        let page = 1;
        let totalPages = 1;
        do {
          const usersResponse = await listUsers({ role: 'student', batch: sessionBatchId, limit: 100, page });
          allStudents = [...allStudents, ...usersResponse.users];
          totalPages = usersResponse.pagination?.totalPages || 1;
          page++;
        } while (page <= totalPages);
        
        // Sort students in ascending order by name, then reverse for correct card stack order
        allStudents.sort((a, b) => {
          const nameA = (a.name || '').toLowerCase();
          const nameB = (b.name || '').toLowerCase();
          return nameA.localeCompare(nameB);
        });
        allStudents.reverse();
        
        // Ensure standard uniform array order
        setStudents(allStudents);
        setCurrentIndex(allStudents.length - 1);

        // Load existing attendance records for this session
        try {
          let allRecords: AttendanceRecord[] = [];
          let recPage = 1;
          let recTotalPages = 1;
          do {
            const response = await listAttendanceRecords({ session: sessionId, limit: 100, page: recPage });
            allRecords = [...allRecords, ...response.records];
            recTotalPages = response.pagination?.totalPages || 1;
            recPage++;
          } while (recPage <= recTotalPages);

          const recordsMap = new Map<string, AttendanceRecord>();
          const records: Array<{ studentId: string; status: AttendanceStatus }> = [];

          allRecords.forEach((record) => {
            recordsMap.set(record.student._id, record);
            records.push({ studentId: record.student._id, status: record.status });
          });

          setExistingRecords(recordsMap);
          setMarkedRecords(records);
        } catch (error) {
          console.warn("Failed to load existing attendance records:", error);
          setExistingRecords(new Map());
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        toast.error("Failed to load session or students.");
      } finally {
        setLoading(false);
      }
    };

    if (sessionId) {
      loadData();
    }
  }, [sessionId]);

  // Generate refs for every single child (TinderCard) so we can manually trigger swipes
  const childRefs = useMemo(
    () =>
      Array(students.length)
        .fill(0)
        .map((i) => React.createRef<TinderCardAPI>()),
    [students.length]
  );

  const canGoBack = currentIndex < students.length - 1;
  const canSwipe = currentIndex >= 0;

  const swiped = (direction: string, studentId: string, index: number) => {
    const status: AttendanceStatus = direction === "right" ? "present" : "absent";
    
    // Show visual feedback for swipe direction
    setLastSwipeDirection(direction === "right" ? 'right' : 'left');
    
    // Auto-reset the visual feedback after 500ms
    setTimeout(() => {
      setLastSwipeDirection(null);
    }, 500);
    
    setMarkedRecords((prev) => {
      const existing = prev.filter((r) => r.studentId !== studentId);
      return [...existing, { studentId, status }];
    });
    
    setCurrentIndex(index - 1);
  };

  const outOfFrame = (name: string, idx: number) => {
    // Fired when the card leaves screen
  };

  const swipe = async (dir: string) => {
    if (canSwipe && currentIndex < students.length) {
      await childRefs[currentIndex].current?.swipe(dir);
    }
  };

  const goBack = async () => {
    if (!canGoBack) return;
    const newIndex = currentIndex + 1;
    await childRefs[newIndex].current?.restoreCard();
    setCurrentIndex(newIndex);
    setLastSwipeDirection(null); // Reset visual feedback
    
    // Remove the most recently saved record to cleanly rewrite it on next swipe
    setMarkedRecords((prev) => {
      const newArray = [...prev];
      newArray.pop();
      return newArray;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (!session) throw new Error("No session found");

      const createRecords: Array<{ student: string; status: AttendanceStatus }> = [];
      const updateRecordsList: Array<{ recordId: string; status: AttendanceStatus }> = [];

      markedRecords.forEach((record) => {
        const existingRecord = existingRecords.get(record.studentId);

        if (existingRecord) {
          updateRecordsList.push({ recordId: existingRecord._id, status: record.status });
        } else {
          createRecords.push({ student: record.studentId, status: record.status });
        }
      });

      let createdCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      // Execute creates
      if (createRecords.length > 0) {
        try {
          const result = await createBulkAttendanceRecords({
            session: session._id,
            records: createRecords,
          });
          createdCount = (result.created ?? []).length;
          errorCount = (result.errors ?? []).length;
        } catch (error) {
          console.error("Failed to create attendance records:", error);
          errorCount += createRecords.length;
        }
      }

      // Execute updates in parallel
      if (updateRecordsList.length > 0) {
        const updatePromises = updateRecordsList.map(({ recordId, status }) =>
          updateAttendanceRecordById(recordId, { status })
        );
        const results = await Promise.allSettled(updatePromises);
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            updatedCount++;
          } else {
            console.error('Failed to update record:', result.reason);
            errorCount++;
          }
        });
      }

      const totalSaved = createdCount + updatedCount;
      if (errorCount > 0) {
        toast.success(`Saved ${totalSaved} records (${createdCount} new, ${updatedCount} updated) with ${errorCount} errors`);
      } else {
        toast.success(`Attendance successfully marked! (${createdCount} new, ${updatedCount} updated)`);
      }
      router.push(`/dashboard/attendance`);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to submit attendance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center flex-col space-y-6">
        <Skeleton className="h-10 w-48 mb-10" />
        <Skeleton className="h-[400px] w-full max-w-sm rounded-[30px]" />
      </div>
    );
  }

  if (!session || students.length === 0) {
    return (
      <div className="min-h-screen p-4 md:p-8 flex flex-col items-center justify-center">
        <h2 className="text-xl font-bold mb-4">No Students Found</h2>
        <Button onClick={() => router.push(`/dashboard/attendance/session/${sessionId}`)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col pt-8 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/attendance/session/${sessionId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Swipe Attendance</h1>
          <p className="text-sm text-muted-foreground">{session.subject.name} - {session.batch?.name || "N/A"}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full relative h-[500px] overflow-hidden">
        {/* Empty State / Summary Screen when done */}
        <AnimatePresence>
          {currentIndex === -1 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center z-0"
            >
              <Card className="w-full text-center shadow-lg border-2">
                <CardHeader>
                  <CardTitle>Session Complete!</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex justify-around py-4 bg-muted/50 rounded-lg">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-500">
                        {markedRecords.filter((r) => r.status === "present").length}
                      </p>
                      <p className="text-sm text-muted-foreground">Present</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-red-500">
                        {markedRecords.filter((r) => r.status === "absent").length}
                      </p>
                      <p className="text-sm text-muted-foreground">Absent</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <Button 
                      className="w-full h-12 text-lg" 
                      onClick={handleSubmit}
                      disabled={submitting}
                    >
                      {submitting ? "Saving..." : (
                        <>
                          <Save className="mr-2 h-5 w-5" /> Submit Attendance
                        </>
                      )}
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => goBack()} disabled={submitting}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Review Last Card
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tinder Card Stack */}
        <div className="relative w-full h-[400px] overflow-hidden">
          {students.map((student, idx) => {
            // Check if this is the current card being shown
            const isCurrentCard = idx === currentIndex;
            
            return (
            <TinderCard
              ref={childRefs[idx]}
              key={student._id || idx}
              className="absolute w-full h-full shadow-xl rounded-[30px] cursor-grab active:cursor-grabbing bg-card border flex flex-col"
              onSwipe={(dir) => swiped(dir, student._id!, idx)}
              onCardLeftScreen={() => outOfFrame(student.name, idx)}
              preventSwipe={["up", "down"]}
            >
              {/* Card Face Layout */}
              <div className={`flex-1 flex flex-col relative w-full h-full bg-card overflow-hidden rounded-[30px] transition-colors duration-500 ${
                isCurrentCard && lastSwipeDirection === 'right'
                  ? 'bg-green-100 dark:bg-green-900/40'
                  : isCurrentCard && lastSwipeDirection === 'left'
                    ? 'bg-red-100 dark:bg-red-900/40'
                    : ''
              }`}>
                
                {(() => {
                  const markedRecord = markedRecords.find(r => r.studentId === student._id);
                  const bgColor = markedRecord?.status === 'present' 
                    ? 'bg-green-50 dark:bg-green-900/20' 
                    : markedRecord?.status === 'absent'
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : 'bg-blue-50 dark:bg-blue-900/20';
                  return (
                    <div className={`h-1/2 ${bgColor} relative flex items-center justify-center border-b`}>
                  <Avatar className="h-32 w-32 border-4 border-background shadow-md shadow-muted/50">
                    <AvatarFallback className="text-4xl">
                      {student.first_name?.charAt(0)}{student.last_name?.charAt(0) || ""}
                    </AvatarFallback>
                  </Avatar>

                      {/* Built-in visual prompt for Swiping Hint */}
                      {idx === students.length - 1 && (
                        <>
                          <div className="absolute top-4 left-4 border-2 border-red-500 text-red-500 font-bold px-3 py-1 rounded-md -rotate-12 opacity-60">NOPE</div>
                          <div className="absolute top-4 right-4 border-2 border-green-500 text-green-500 font-bold px-3 py-1 rounded-md rotate-12 opacity-60">LIKE</div>
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
                  <h2 className="text-2xl font-bold mb-3">{student.name}</h2>
                  {(() => {
                    const markedRecord = markedRecords.find(r => r.studentId === student._id);
                    const badgeBg = markedRecord?.status === 'present'
                      ? 'bg-green-100 dark:bg-green-900/30 border-green-500'
                      : markedRecord?.status === 'absent'
                        ? 'bg-red-100 dark:bg-red-900/30 border-red-500'
                        : 'bg-primary/10 border-primary';
                    const badgeText = markedRecord?.status === 'present'
                      ? 'text-green-700 dark:text-green-300'
                      : markedRecord?.status === 'absent'
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-primary';
                    return (
                      <div className={`w-12 h-12 rounded-full ${badgeBg} flex items-center justify-center border-2`}>
                        <span className={`text-sm font-semibold ${badgeText}`}>
                          {((student.profile as any)?.candidate_code || '').slice(-3).replace(/^0+/, '') || "N/A"}
                        </span>
                      </div>
                    );
                  })()}
                  
                  <div className="mt-8 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1">Swipe <strong className="text-green-500">Right</strong> for Present</p>
                    <p className="flex items-center gap-1 mt-1">Swipe <strong className="text-red-500">Left</strong> for Absent</p>
                  </div>
                </div>
              </div>
            </TinderCard>
            );
          })}
        </div>

        {/* Manual Buttons */}
        {currentIndex >= 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-6 mt-8 z-10 p-4 overflow-hidden"
          >
            <Button
              onClick={() => swipe("left")}
              size="icon"
              className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950/50 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-500 shadow-md transition-transform active:scale-95"
            >
              <X className="h-8 w-8" />
            </Button>
            
            <Button
              onClick={() => goBack()}
              size="icon"
              variant="outline"
              disabled={!canGoBack}
              className="h-12 w-12 rounded-full shadow-sm"
              title="Undo Check"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>

            <Button
              onClick={() => swipe("right")}
              size="icon"
              className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-950/50 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-500 shadow-md transition-transform active:scale-95"
            >
              <Check className="h-8 w-8" />
            </Button>
          </motion.div>
        )}
      </div>
      
      {/* Progress Footer */}
      {currentIndex >= 0 && (
        <div className="mt-8 text-center text-sm font-medium text-muted-foreground w-full max-w-sm mx-auto">
          <p>{students.length - currentIndex} / {students.length} Students Checked</p>
          <div className="w-full bg-muted h-2 rounded-full mt-2 overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${((students.length - 1 - currentIndex) / students.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
