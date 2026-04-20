"use client";

import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, CircleAlert } from "lucide-react";
import { createBulkAttendanceRecords, updateAttendanceRecordById, type AttendanceStatus } from "@/lib/api/attendance-record";
import type { User } from "@/lib/types/UserTypes";
import type { AttendanceSession, EmbeddedAttendanceRecord } from "@/lib/api/attendance-session";

interface CsvAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AttendanceSession;
  students: User[];
  existingRecords: Map<string, EmbeddedAttendanceRecord>;
  onSuccess?: () => void;
}

export default function CsvAttendanceDialog({
  open,
  onOpenChange,
  session,
  students,
  existingRecords,
  onSuccess,
}: CsvAttendanceDialogProps) {
  const [mode, setMode] = useState<"present" | "absent">("present");
  const [rollInput, setRollInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const normalizedRollMap = useMemo(() => {
    const map = new Map<string, { studentId: string; studentName: string }>();
    students.forEach((student) => {
      const p = (student.profile ?? {}) as any;
      const candidateCode = p.candidate_code?.trim();
      if (!candidateCode || !student._id) return;
      const lastThreeDigits = candidateCode.slice(-3).padStart(3, '0');
      map.set(lastThreeDigits, { studentId: student._id, studentName: student.name || '' });
    });
    return map;
  }, [students]);

  const parsedRolls = useMemo(() => {
    return rollInput
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }, [rollInput]);

  const uniqueParsedRolls = useMemo(() => {
    const unique = new Set<string>();
    parsedRolls.forEach((roll) => {
      const normalized = roll.padStart(3, '0');
      unique.add(normalized);
    });
    return unique;
  }, [parsedRolls]);

  const matchingStudentIds = useMemo(() => {
    const ids = new Set<string>();
    uniqueParsedRolls.forEach((roll) => {
      const match = normalizedRollMap.get(roll);
      if (match) ids.add(match.studentId);
    });
    return ids;
  }, [normalizedRollMap, uniqueParsedRolls]);

  const matchedStudents = useMemo(() => {
    const matched: { studentId: string; studentName: string; rollNo: string }[] = [];
    uniqueParsedRolls.forEach((roll) => {
      const match = normalizedRollMap.get(roll);
      if (match) {
        matched.push({
          studentId: match.studentId,
          studentName: match.studentName,
          rollNo: roll,
        });
      }
    });
    return matched.sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [normalizedRollMap, uniqueParsedRolls]);

  const unknownRolls = useMemo(() => {
    const unknown: string[] = [];
    uniqueParsedRolls.forEach((roll) => {
      if (!normalizedRollMap.has(roll)) unknown.push(roll);
    });
    return unknown;
  }, [normalizedRollMap, uniqueParsedRolls]);

  const presentCount = useMemo(() => {
    if (mode === "present") return matchingStudentIds.size;
    return Math.max(0, students.length - matchingStudentIds.size);
  }, [matchingStudentIds.size, mode, students.length]);

  const absentCount = useMemo(() => {
    if (mode === "absent") return matchingStudentIds.size;
    return Math.max(0, students.length - matchingStudentIds.size);
  }, [matchingStudentIds.size, mode, students.length]);

  const handleSave = async () => {
    if (!session || students.length === 0) return;

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const createRecords: Array<{ student: string; status: AttendanceStatus }> = [];
      const updateRecordsList: Array<{ recordId: string; status: AttendanceStatus }> = [];

      students.forEach((student) => {
        if (!student._id) return;

        const isListed = matchingStudentIds.has(student._id);
        const status: AttendanceStatus =
          mode === "present"
            ? isListed
              ? "present"
              : "absent"
            : isListed
              ? "absent"
              : "present";

        const existingRecord = existingRecords.get(student._id);
        if (existingRecord) {
          updateRecordsList.push({ recordId: existingRecord._id, status });
        } else {
          createRecords.push({ student: student._id, status });
        }
      });

      let createdCount = 0;
      let updatedCount = 0;
      let errorCount = 0;

      if (createRecords.length > 0) {
        const result = await createBulkAttendanceRecords({
          session: session._id,
          records: createRecords,
        });
        createdCount = (result.created ?? []).length;
        errorCount += (result.errors ?? []).length;
      }

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
      setSaveMessage(
        errorCount > 0
          ? `Saved ${totalSaved} records (${createdCount} new, ${updatedCount} updated) with ${errorCount} errors.`
          : `Saved ${totalSaved} records successfully (${createdCount} new, ${updatedCount} updated).`
      );

      if (errorCount === 0) {
        setTimeout(() => {
          onOpenChange(false);
          onSuccess?.();
        }, 1500);
      }
    } catch (error) {
      console.error("Failed to save attendance:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to save attendance records");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setMode("present");
    setRollInput("");
    setSaveMessage(null);
    setSaveError(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark Attendance with Roll Numbers</DialogTitle>
          <DialogDescription>
            Enter roll numbers (comma or newline separated) to mark attendance for {session.subject?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Mode Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Mode</Label>
            <div className="flex gap-4">
              <Button
                variant={mode === "present" ? "default" : "outline"}
                onClick={() => setMode("present")}
                className="flex-1"
              >
                Present
              </Button>
              <Button
                variant={mode === "absent" ? "default" : "outline"}
                onClick={() => setMode("absent")}
                className="flex-1"
              >
                Absent
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "present"
                ? "Listed students will be marked present, others absent"
                : "Listed students will be marked absent, others present"}
            </p>
          </div>

          {/* Roll Input */}
          <div className="space-y-3">
            <Label htmlFor="rollInput" className="text-base font-semibold">
              Roll Numbers
            </Label>
            <Textarea
              id="rollInput"
              placeholder="Enter roll numbers separated by commas or new lines (e.g., 001,005,010 or paste from spreadsheet)"
              value={rollInput}
              onChange={(e) => setRollInput(e.target.value)}
              className="min-h-32 font-mono text-sm"
              disabled={saving}
            />
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Present</p>
              <p className="text-xl font-bold">{presentCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Absent</p>
              <p className="text-xl font-bold">{absentCount}</p>
            </div>
          </div>

          {/* Matched Students */}
          {matchedStudents.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Matched Students ({matchedStudents.length})</Label>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {matchedStudents.map((student) => (
                  <div
                    key={student.studentId}
                    className="flex items-center justify-between p-2 rounded border text-sm"
                  >
                    <span>{student.studentName}</span>
                    <Badge variant="secondary">{student.rollNo}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unknown Rolls */}
          {unknownRolls.length > 0 && (
            <Alert variant="destructive">
              <CircleAlert className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-1">Unknown roll numbers: {unknownRolls.join(", ")}</p>
                <p className="text-xs">These roll numbers don't match any student in the batch.</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Success Message */}
          {saveMessage && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{saveMessage}</AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {saveError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{saveError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex gap-2 justify-end mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || students.length === 0}>
            {saving ? "Saving..." : "Mark Attendance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
