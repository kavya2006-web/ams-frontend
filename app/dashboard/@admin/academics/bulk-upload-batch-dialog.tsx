"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { createBatchesBulk, CreateBatchData, Department, listBatches } from "@/lib/api/batch";
import { listUsers } from "@/lib/api/user";
import type { User } from "@/lib/types/UserTypes";
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
  success: Array<{ name: string; batchId?: string }>;
  failed: Array<{ name?: string; error?: string }>;
};

type CsvRow = Record<string, string | undefined>;

type PreviewRow = {
  rowNumber: number;
  id?: string;
  name: string;
  adm_year?: number;
  department?: Department;
  staff_advisor: string;
  errors: string[];
  payload?: CreateBatchData;
};

const TEMPLATE_HEADERS = [
  "Batch ID",
  "Name",
  "Adm Year",
  "Department",
  "Staff Advisor Email",
] as const;

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const CSV_HEADER_MAP: Record<string, string> = {
  "batch id": "id",
  "id": "id",
  "batch_id": "id",
  "name": "name",
  "batch name": "name",
  "adm year": "adm_year",
  "admission year": "adm_year",
  "department": "department",
  "staff advisor email": "staff_advisor_email",
  "email": "staff_advisor_email",
  "advisor email": "staff_advisor_email",
};

function buildTemplateCsv(): string {
  const exampleRow: Record<string, string> = {
    "Batch ID": "24CSE1",
    "Name": "24CSE-A",
    "Adm Year": "2024",
    "Department": "CSE",
    "Staff Advisor Email": "teacher@example.com",
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

export function BulkUploadBatchDialog({ open, onOpenChange, onSuccess }: BulkUploadDialogProps) {
  const batchIdPattern = /^[0-9]{2}[A-Z]{2,3}[0-9]*$/;

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultStatusCode, setResultStatusCode] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [existingBatchIds, setExistingBatchIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      const fetchAllTeachers = async () => {
        let all: User[] = [];
        let page = 1;
        let totalPages = 1;
        try {
          do {
            const data = await listUsers({ role: "teacher", limit: 100, page });
            all = [...all, ...data.users];
            totalPages = data.pagination?.totalPages || 1;
            page++;
          } while (page <= totalPages);
          setTeachers(all);
        } catch (err) {
          console.error(err);
        }
      };
      const fetchExistingBatchIds = async () => {
        const ids = new Set<string>();
        let page = 1;
        let totalPages = 1;
        try {
          do {
            const data = await listBatches({ limit: 100, page });
            data.batches.forEach((b) => {
              if (b.id) ids.add(b.id.toUpperCase());
            });
            totalPages = data.pagination?.totalPages || 1;
            page++;
          } while (page <= totalPages);
        } catch (err) {
          console.error(err);
        }
        setExistingBatchIds(ids);
      };
      fetchAllTeachers();
      fetchExistingBatchIds();
    }
  }, [open]);

  const resetState = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setResultMessage(null);
    setResultStatusCode(null);
    setIsSubmitting(false);
    setIsParsing(false);
    setPreviewRows(null);
    setExistingBatchIds(new Set());
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

  const buildPreview = (rows: CsvRow[], availableTeachers: User[], existingIds: Set<string>): PreviewRow[] => {
    const preview = rows.map((r, idx) => {
      const rowNumber = idx + 2; 

      const idRaw = (r.id || "").trim().toUpperCase();
      const name = (r.name || "").trim();
      const adm_year_raw = (r.adm_year || "").trim();
      const departmentRaw = (r.department || "").trim().toUpperCase();
      const staff_advisor_email = (r.staff_advisor_email || "").trim().toLowerCase();

      const errors: string[] = [];
      if (idRaw && !batchIdPattern.test(idRaw)) {
        errors.push("Batch ID must match format like 24CSE, 24CSE1, 24CSE2");
      }
      if (!name) errors.push("Name is required");
      if (!adm_year_raw) errors.push("Adm Year is required");
      if (!departmentRaw) errors.push("Department is required");
      if (!staff_advisor_email) errors.push("Staff Advisor Email is required");

      let adm_year: number | undefined;
      if (adm_year_raw) {
        const parsed = Number.parseInt(adm_year_raw, 10);
        if (Number.isNaN(parsed)) {
          errors.push("Adm Year must be a number");
        } else {
          adm_year = parsed;
        }
      }

      let department: Department | undefined;
      if (departmentRaw) {
        if (["CSE", "ECE", "IT"].includes(departmentRaw)) {
          department = departmentRaw as Department;
        } else {
          errors.push("Department must be one of: CSE, ECE, IT");
        }
      }

      let staff_advisor = "";
      if (staff_advisor_email) {
        const t = availableTeachers.find(u => (u.email || "").toLowerCase() === staff_advisor_email);
        if (t) {
          staff_advisor = t._id || "";
        } else {
          errors.push(`No teacher found with email: ${staff_advisor_email}. Note: please ensure user exists and has role=teacher.`);
        }
      }

      let payload: CreateBatchData | undefined = undefined;
      if (!errors.length && adm_year && department && staff_advisor) {
        payload = {
          id: idRaw || undefined,
          name,
          adm_year,
          department,
          staff_advisor,
        };
      }

      return {
        rowNumber,
        id: idRaw || undefined,
        name,
        adm_year,
        department,
        staff_advisor,
        errors,
        payload,
      };
    });

    const usedIds = new Set(existingIds);

    // Validate explicit IDs for duplicates (in CSV and existing backend records).
    const explicitIdRows = new Map<string, number[]>();
    preview.forEach((row) => {
      if (!row.id) return;
      const id = row.id.toUpperCase();
      const rowsList = explicitIdRows.get(id) || [];
      rowsList.push(row.rowNumber);
      explicitIdRows.set(id, rowsList);
    });

    explicitIdRows.forEach((rowsList, id) => {
      if (rowsList.length > 1) {
        preview.forEach((row) => {
          if (row.id?.toUpperCase() === id) {
            row.errors.push(`Duplicate Batch ID in CSV: ${id}`);
          }
        });
      }

      if (usedIds.has(id)) {
        preview.forEach((row) => {
          if (row.id?.toUpperCase() === id) {
            row.errors.push(`Batch ID already exists: ${id}`);
          }
        });
      }
    });

    // Reserve valid explicit IDs.
    preview.forEach((row) => {
      if (row.id && !row.errors.some((e) => e.includes("Batch ID"))) {
        usedIds.add(row.id.toUpperCase());
      }
    });

    // Auto-generate IDs for rows without explicit ID.
    // Rule: if same yy+dept appears multiple times in upload, generate suffixed IDs: 24CSE1, 24CSE2, ...
    const grouped = new Map<string, number[]>();
    preview.forEach((row, index) => {
      if (row.errors.length > 0) return;
      if (row.id) return;
      if (!row.adm_year || !row.department) return;
      const baseId = `${String(row.adm_year).slice(-2)}${row.department}`;
      const list = grouped.get(baseId) || [];
      list.push(index);
      grouped.set(baseId, list);
    });

    grouped.forEach((indices, baseId) => {
      const shouldForceSuffix = indices.length > 1;
      let suffix = 1;

      indices.forEach((index) => {
        let finalId = "";
        if (!shouldForceSuffix && !usedIds.has(baseId)) {
          finalId = baseId;
        } else {
          while (usedIds.has(`${baseId}${suffix}`)) {
            suffix += 1;
          }
          finalId = `${baseId}${suffix}`;
          suffix += 1;
        }

        usedIds.add(finalId);
        preview[index].id = finalId;
        if (preview[index].payload) {
          preview[index].payload = {
            ...preview[index].payload,
            id: finalId,
          };
        }
      });
    });

    return preview;
  };

  const handleDownloadTemplate = () => {
    const csv = buildTemplateCsv();
    downloadTextFile(`ams-batches-template.csv`, csv);
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
        const preview = buildPreview(rows, teachers, existingBatchIds);
        setPreviewRows(preview);
      } catch (e) {
        setPreviewRows(null);
        setError(e instanceof Error ? e.message : "Failed to parse CSV");
      } finally {
        setIsParsing(false);
      }
    };
    run();
  }, [file, teachers, existingBatchIds]);

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

      const payload = previewRows.map((r) => r.payload).filter((p): p is CreateBatchData => Boolean(p));
      
      setIsSubmitting(true);
      const response = await createBatchesBulk(payload);

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
          <DialogTitle>Bulk Import Batches (CSV)</DialogTitle>
          <DialogDescription>
            Upload a CSV to create multiple batches at once.
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
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Adm Year</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.slice(0, 50).map((r) => (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell>{r.id || "(auto)"}</TableCell>
                        <TableCell>{r.name || "—"}</TableCell>
                        <TableCell>{r.department || "—"}</TableCell>
                        <TableCell>{r.adm_year || "—"}</TableCell>
                        <TableCell>
                          {r.errors.length ? (
                            <div className="flex flex-col gap-1">
                              {r.errors.map((err, i) => (
                                <span key={i} className="text-xs text-destructive">
                                  {err}
                                </span>
                              ))}
                            </div>
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
