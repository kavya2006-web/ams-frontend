"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { createSubjectsBulk, CreateSubjectData, SubjectType } from "@/lib/api/subject";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type BulkUploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type BulkResult = {
  success: Array<{ name: string; subjectId?: string }>;
  failed: Array<{ name?: string; error?: string }>;
};

type CsvRow = Record<string, string | undefined>;

type PreviewRow = {
  rowNumber: number;
  name: string;
  sem: string;
  subject_code: string;
  type?: SubjectType;
  total_marks?: number;
  pass_mark?: number;
  errors: string[];
  payload?: CreateSubjectData;
};

const TEMPLATE_HEADERS = [
  "Name",
  "Sem",
  "Subject Code",
  "Type",
  "Total Marks",
  "Pass Mark",
] as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const CSV_HEADER_MAP: Record<string, string> = {
  "name": "name",
  "subject name": "name",
  "sem": "sem",
  "semester": "sem",
  "subject code": "subject_code",
  "code": "subject_code",
  "type": "type",
  "total marks": "total_marks",
  "pass mark": "pass_mark",
};

function buildTemplateCsv(): string {
  const exampleRow: Record<string, string> = {
    "Name": "Data Structures",
    "Sem": "S3",
    "Subject Code": "CS201",
    "Type": "Theory",
    "Total Marks": "100",
    "Pass Mark": "40",
  };

  const csv = Papa.unparse({
    fields: [...TEMPLATE_HEADERS],
    data: [[...TEMPLATE_HEADERS].map((h) => exampleRow[h] ?? "")],
  });

  return csv + "\n";
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function BulkUploadSubjectDialog({ open, onOpenChange, onSuccess }: BulkUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultStatusCode, setResultStatusCode] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);

  const resetState = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setResultMessage(null);
    setResultStatusCode(null);
    setIsSubmitting(false);
    setIsParsing(false);
    setPreviewRows(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) resetState();
    onOpenChange(isOpen);
  };

  const parseCsvFile = async (csvFile: File): Promise<CsvRow[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse<CsvRow>(csvFile, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => {
          const normalized = normalizeHeader(h);
          return CSV_HEADER_MAP[normalized] ?? normalized;
        },
        complete: (res) => {
          if (res.errors?.length) {
            reject(new Error(res.errors[0]?.message || "Failed to parse CSV"));
            return;
          }
          resolve(res.data || []);
        },
      });
    });
  };

  const buildPreview = (rows: CsvRow[]): PreviewRow[] => {
    return rows.map((r, idx) => {
      const rowNumber = idx + 2; 

      const name = (r.name || "").trim();
      const sem = (r.sem || "").trim();
      const subject_code = (r.subject_code || "").trim();
      const typeRaw = (r.type || "").trim();
      const totalMarksRaw = (r.total_marks || "").trim();
      const passMarkRaw = (r.pass_mark || "").trim();

      const errors: string[] = [];
      if (!name) errors.push("Name is required");
      if (!sem) errors.push("Sem is required");
      if (!subject_code) errors.push("Subject Code is required");
      if (!typeRaw) errors.push("Type is required");
      if (!totalMarksRaw) errors.push("Total Marks is required");
      if (!passMarkRaw) errors.push("Pass Mark is required");

      let type: SubjectType | undefined;
      if (typeRaw) {
        // case insensitive
        if (typeRaw.toLowerCase() === "theory") type = "Theory";
        else if (typeRaw.toLowerCase() === "practical") type = "Practical";
        else errors.push("Type must be Theory or Practical");
      }

      let total_marks: number | undefined;
      let pass_mark: number | undefined;

      if (totalMarksRaw) {
        total_marks = Number(totalMarksRaw);
        if (isNaN(total_marks)) errors.push("Total Marks must be a number");
      }
      if (passMarkRaw) {
        pass_mark = Number(passMarkRaw);
        if (isNaN(pass_mark)) errors.push("Pass Mark must be a number");
      }

      let payload: CreateSubjectData | undefined = undefined;
      if (!errors.length && type && total_marks !== undefined && pass_mark !== undefined) {
        payload = {
          name,
          sem,
          subject_code,
          type,
          total_marks,
          pass_mark,
          faculty_in_charge: [] // CSV bulk upload might not easily set faculty_in_charge
        };
      }

      return {
        rowNumber,
        name,
        sem,
        subject_code,
        type,
        total_marks,
        pass_mark,
        errors,
        payload,
      };
    });
  };

  const handleDownloadTemplate = () => {
    const csv = buildTemplateCsv();
    downloadTextFile(`ams-subjects-template.csv`, csv);
  };

  useEffect(() => {
    const run = async () => {
      if (!file) {
        setPreviewRows(null);
        return;
      }
      try {
        setIsParsing(true);
        setError(null);
        setPreviewRows(null);

        const rows = await parseCsvFile(file);
        if (!rows.length) {
          setPreviewRows([]);
          setError("CSV appears to be empty.");
          return;
        }
        const preview = buildPreview(rows);
        setPreviewRows(preview);
      } catch (e) {
        setPreviewRows(null);
        setError(e instanceof Error ? e.message : "Failed to parse CSV");
      } finally {
        setIsParsing(false);
      }
    };
    run();
  }, [file]);

  const handleSubmit = async () => {
    try {
      setError(null);
      setResult(null);
      setResultMessage(null);
      setResultStatusCode(null);

      if (!file) {
        setError("Choose a CSV file to upload.");
        return;
      }

      if (!previewRows || !previewRows.length) {
        setError("No valid rows to upload.");
        return;
      }

      const rowsWithErrors = previewRows.filter((r) => r.errors.length);
      if (rowsWithErrors.length) {
        setError(`Fix validation errors before uploading. ${rowsWithErrors.length} row(s) have issues.`);
        return;
      }

      const payload = previewRows.map((r) => r.payload).filter((p): p is CreateSubjectData => Boolean(p));
      
      setIsSubmitting(true);
      const response = await createSubjectsBulk(payload);

      setResult({
        success: response.data?.success ?? [],
        failed: response.data?.failed ?? [],
      });
      setResultMessage(response.message || null);
      setResultStatusCode(response.httpStatus ?? response.status_code ?? null);

      if (onSuccess) onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPartial = resultStatusCode === 207;
  const isAllFailed = resultStatusCode === 422;
  const previewErrorCount = previewRows?.filter((r) => r.errors.length).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[85vw] w-full max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Subjects (CSV)</DialogTitle>
          <DialogDescription>
            Upload a CSV to create multiple subjects at once.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert
            variant={isAllFailed ? "destructive" : undefined}
            className={
              isPartial
                ? "bg-muted/50"
                : !isAllFailed && result.failed.length
                  ? "border-destructive/40 bg-destructive/10"
                  : !isAllFailed
                    ? "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
                    : undefined
            }
          >
            {isAllFailed || result.failed.length ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            <AlertDescription className="ml-2 space-y-1">
              {resultMessage ? <div>{resultMessage}</div> : null}
              <div>Completed: {result.success.length} succeeded, {result.failed.length} failed.</div>
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadTemplate}
              disabled={isSubmitting}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          <div className="space-y-2">
            <Label>CSV File *</Label>
            <Input
              type="file"
              accept=".csv,text/csv"
              disabled={isSubmitting}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {isParsing ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing CSV...
            </div>
          ) : null}

          {previewRows ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Preview</div>
                <div className="text-xs text-muted-foreground">
                  {previewRows.length} row(s), {previewErrorCount} with errors
                </div>
              </div>

              <div className="rounded-md border max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, 50).map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell>{r.subject_code || "—"}</TableCell>
                        <TableCell>{r.name || "—"}</TableCell>
                        <TableCell>{r.type || "—"}</TableCell>
                        <TableCell>
                          {r.errors.length ? (
                            <Badge variant="destructive">{r.errors.length} issue(s)</Badge>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Close
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || isParsing}>
            {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</> : <><Upload className="mr-2 h-4 w-4" />Upload CSV</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
