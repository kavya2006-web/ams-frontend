"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Users, Plus } from "lucide-react";
import { createAttendanceSession, type CreateSessionData, type SessionType } from "@/lib/api/attendance-session";
import { listBatches, type Batch } from "@/lib/api/batch";
import { listSubjects, type Subject } from "@/lib/api/subject";
import { format, setHours, setMinutes, setSeconds, setMilliseconds } from "date-fns";
import { useRouter } from "next/navigation";

interface CreateClassDialogProps {
  onClassCreated?: () => void;
}

export default function CreateClassDialog({ onClassCreated }: CreateClassDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [batchId, setBatchId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [duration, setDuration] = useState<number>(1);
  const [startHour, setStartHour] = useState<number>(new Date().getHours());
  const [sessionType, setSessionType] = useState<SessionType>("regular");

  useEffect(() => {
    if (open) {
      loadData();
      setStartHour(new Date().getHours());
      setDuration(1);
      setSessionType("regular");
      setBatchId("");
      setSubjectId("");
    }
  }, [open]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [batchesData, subjectsData] = await Promise.all([
        listBatches({ limit: 100 }),
        listSubjects({ limit: 100 }),
      ]);
      setBatches(batchesData.batches);
      setSubjects(subjectsData.subjects);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoadingData(false);
    }
  };

  const getStartTimePreview = () => {
    let t = setHours(new Date(), startHour);
    t = setMinutes(t, 0);
    t = setSeconds(t, 0);
    t = setMilliseconds(t, 0);
    return t;
  };

  const getEndTimePreview = () =>
    new Date(getStartTimePreview().getTime() + duration * 60 * 60 * 1000);

  const selectedBatch = batches.find((b) => b._id === batchId);
  const selectedSubject = subjects.find((s) => s._id === subjectId);

  const handleSubmit = async () => {
    if (!batchId || !subjectId) return;
    setLoading(true);
    try {
      const startTime = getStartTimePreview();
      const endTime = getEndTimePreview();

      const sessionData: CreateSessionData = {
        batch: batchId,
        subject: subjectId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        hours_taken: duration,
        session_type: sessionType,
      };

      const newSession = await createAttendanceSession(sessionData);
      setOpen(false);
      onClassCreated?.();
      router.push(`/dashboard/attendance/session/${newSession._id}`);
    } catch (error) {
      console.error("Failed to create class:", error);
      alert(error instanceof Error ? error.message : "Failed to create class");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="w-full md:w-auto">
          <Plus className="mr-2 h-5 w-5" />
          Create New Class
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Class</DialogTitle>
          <DialogDescription>
            Configure and start a new attendance session
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Schedule Preview */}
          <div className="bg-muted rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2 min-w-0">
                <BookOpen className="h-4 w-4 text-primary mt-1 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {selectedSubject ? selectedSubject.name : <span className="text-muted-foreground font-normal">No subject selected</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedSubject ? selectedSubject.subject_code : "—"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {selectedBatch ? `${selectedBatch.name} · ${selectedBatch.adm_year}` : "No batch selected"}
                </span>
              </div>
            </div>
            <div className="border-t pt-3 grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Start</p>
                <p className="font-medium">{format(getStartTimePreview(), "hh:mm a")}</p>
                <p className="text-xs text-muted-foreground">{format(getStartTimePreview(), "MMM dd, yyyy")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">End</p>
                <p className="font-medium">{format(getEndTimePreview(), "hh:mm a")}</p>
                <p className="text-xs text-muted-foreground">{format(getEndTimePreview(), "MMM dd, yyyy")}</p>
              </div>
            </div>
          </div>

          {/* Batch & Subject */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select value={batchId} onValueChange={setBatchId} disabled={loadingData}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingData ? "Loading..." : "Select batch"} />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch._id} value={batch._id}>
                      {batch.name} ({batch.adm_year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId} disabled={loadingData}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingData ? "Loading..." : "Select subject"} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject._id} value={subject._id}>
                      {subject.name} ({subject.subject_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label>Duration</Label>
            <div className="flex gap-2">
              {[1, 2, 3].map((hrs) => (
                <Button
                  key={hrs}
                  type="button"
                  variant={duration === hrs ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDuration(hrs)}
                >
                  {hrs} {hrs === 1 ? "hour" : "hours"}
                </Button>
              ))}
            </div>
          </div>

          {/* Start Time */}
          <div className="space-y-2">
            <Label>Start Time</Label>
            <Select value={String(startHour)} onValueChange={(v) => setStartHour(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {format(setHours(new Date(), i), "hh:00 a")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Session Type */}
          <div className="space-y-2">
            <Label>Session Type</Label>
            <div className="flex gap-2">
              {(["regular", "extra", "practical"] as SessionType[]).map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant={sessionType === type ? "default" : "outline"}
                  className="flex-1 capitalize"
                  onClick={() => setSessionType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading || loadingData || !batchId || !subjectId}>
              {loading ? "Creating..." : "Start Class"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
