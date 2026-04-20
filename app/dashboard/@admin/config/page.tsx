"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
    listConfigItems,
    createConfigItem,
    updateConfigItem,
    deleteConfigItem,
    type ConfigItem,
    type ConfigValue,
} from "@/lib/api/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
    ArrowLeft,
    Plus,
    Pencil,
    Trash2,
    RefreshCw,
    Settings2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Value type helpers                                                   */
/* ------------------------------------------------------------------ */

type ValueType = "string" | "number" | "boolean" | "array" | "json";

function detectType(val: ConfigValue): ValueType {
    if (Array.isArray(val)) return "array";
    if (typeof val === "object" && val !== null) return "json";
    if (typeof val === "boolean") return "boolean";
    if (typeof val === "number") return "number";
    return "string";
}

function valueToEditString(val: ConfigValue, type: ValueType): string {
    if (type === "json" || (typeof val === "object" && val !== null && !Array.isArray(val))) {
        return JSON.stringify(val, null, 2);
    }
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
}

function valueToDisplayString(val: ConfigValue): string {
    if (typeof val === "object" && val !== null) return JSON.stringify(val);
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
}

/** Returns the parsed value or throws a descriptive Error. */
function parseValue(raw: string, type: ValueType): ConfigValue {
    switch (type) {
        case "number": {
            const n = Number(raw);
            if (isNaN(n)) throw new Error(`"${raw}" is not a valid number`);
            return n;
        }
        case "boolean":
            return raw === "true";
        case "array":
            return raw
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((s) => {
                    const n = Number(s);
                    if (!isNaN(n) && s !== "") return n;
                    if (s === "true") return true;
                    if (s === "false") return false;
                    return s;
                });
        case "json": {
            try {
                return JSON.parse(raw);
            } catch {
                throw new Error("Invalid JSON — check syntax and try again");
            }
        }
        default:
            return raw;
    }
}

const TYPE_COLORS: Record<ValueType, string> = {
    string: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    number: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    boolean: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    array: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    json: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function ValueTypeBadge({ type }: { type: ValueType }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono font-medium ${TYPE_COLORS[type]}`}
        >
            {type}
        </span>
    );
}

/* ------------------------------------------------------------------ */
/* Config form                                                          */
/* ------------------------------------------------------------------ */

interface ConfigFormState {
    key: string;
    valueRaw: string;
    valueType: ValueType;
    description: string;
}

function InlineError({ message }: { message: string }) {
    return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
        </div>
    );
}

function ConfigFormDialog({
    open,
    onOpenChange,
    initial,
    onSave,
}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    initial?: ConfigItem;
    onSave: (data: { key: string; value: ConfigValue; description: string }) => Promise<void>;
}) {
    const isEdit = Boolean(initial);
    const [form, setForm] = useState<ConfigFormState>({
        key: initial?.key ?? "",
        valueRaw: initial ? valueToEditString(initial.value, detectType(initial.value)) : "",
        valueType: initial ? detectType(initial.value) : "string",
        description: initial?.description ?? "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset when dialog re-opens with a new item
    useEffect(() => {
        if (open) {
            setError(null);
            setForm({
                key: initial?.key ?? "",
                valueRaw: initial ? valueToEditString(initial.value, detectType(initial.value)) : "",
                valueType: initial ? detectType(initial.value) : "string",
                description: initial?.description ?? "",
            });
        }
    }, [open, initial]);

    const handleSubmit = async () => {
        setError(null);
        if (!form.key.trim()) {
            setError("Key is required");
            return;
        }

        let parsed: ConfigValue;
        try {
            parsed = parseValue(form.valueRaw, form.valueType);
        } catch (e: any) {
            setError(e.message ?? "Invalid value");
            return;
        }

        setSaving(true);
        try {
            await onSave({
                key: form.key.trim(),
                value: parsed,
                description: form.description,
            });
            onOpenChange(false);
        } catch (e: any) {
            setError(e.message ?? "Failed to save — please try again");
        } finally {
            setSaving(false);
        }
    };

    const usesTextarea = form.valueType === "json" || form.valueType === "array";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEdit ? "Edit Config" : "New Config Variable"}</DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? `Editing key "${initial?.key}"`
                            : "Add a new key-value configuration variable."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Inline error banner */}
                    {error && <InlineError message={error} />}

                    {/* Key */}
                    <div className="space-y-1.5">
                        <Label htmlFor="cfg-key">Key</Label>
                        <Input
                            id="cfg-key"
                            placeholder="e.g. feature.swipe_attendance"
                            value={form.key}
                            disabled={isEdit}
                            onChange={(e) => { setError(null); setForm((p) => ({ ...p, key: e.target.value })); }}
                            className="font-mono"
                        />
                    </div>

                    {/* Value type */}
                    <div className="space-y-1.5">
                        <Label>Value type</Label>
                        <div className="flex gap-2 flex-wrap">
                            {(["string", "number", "boolean", "array", "json"] as ValueType[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => { setError(null); setForm((p) => ({ ...p, valueType: t, valueRaw: "" })); }}
                                    className={`px-3 py-1 rounded-full border text-xs font-mono transition-colors ${
                                        form.valueType === t
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "border-border text-muted-foreground hover:border-primary/50"
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Value */}
                    <div className="space-y-1.5">
                        <Label htmlFor="cfg-value">Value</Label>

                        {form.valueType === "boolean" ? (
                            <div className="flex gap-3">
                                {["true", "false"].map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setForm((p) => ({ ...p, valueRaw: v }))}
                                        className={`flex-1 py-2 rounded-lg border text-sm font-mono transition-colors ${
                                            form.valueRaw === v
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "border-border text-muted-foreground hover:border-primary/50"
                                        }`}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                        ) : usesTextarea ? (
                            <Textarea
                                id="cfg-value"
                                placeholder={
                                    form.valueType === "json"
                                        ? '{\n  "key": "value"\n}'
                                        : "val1, val2, 42, true"
                                }
                                value={form.valueRaw}
                                onChange={(e) => { setError(null); setForm((p) => ({ ...p, valueRaw: e.target.value })); }}
                                className="font-mono text-sm min-h-28 resize-y"
                                spellCheck={false}
                            />
                        ) : (
                            <Input
                                id="cfg-value"
                                placeholder={form.valueType === "number" ? "42" : "value"}
                                value={form.valueRaw}
                                onChange={(e) => { setError(null); setForm((p) => ({ ...p, valueRaw: e.target.value })); }}
                                className="font-mono"
                            />
                        )}

                        {form.valueType === "array" && (
                            <p className="text-xs text-muted-foreground">
                                Separate values with commas. Numbers and booleans are auto-cast.
                            </p>
                        )}
                        {form.valueType === "json" && (
                            <p className="text-xs text-muted-foreground">
                                Enter any valid JSON — object, array, string, number, or boolean.
                            </p>
                        )}
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label htmlFor="cfg-desc">Description (optional)</Label>
                        <Textarea
                            id="cfg-desc"
                            placeholder="What does this config key control?"
                            value={form.description}
                            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                            rows={2}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving}>
                        {saving ? "Saving…" : isEdit ? "Update" : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ------------------------------------------------------------------ */
/* Main page                                                            */
/* ------------------------------------------------------------------ */

function getNamespace(key: string): string {
    const slash = key.indexOf("/");
    return slash !== -1 ? key.slice(0, slash) : "";
}

export default function AdminConfigPage() {
    const router = useRouter();
    const { user, isLoading: authLoading, refetchConfig } = useAuth();

    const [items, setItems] = useState<ConfigItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<ConfigItem | undefined>(undefined);
    const [deleteTarget, setDeleteTarget] = useState<ConfigItem | undefined>(undefined);
    const [deleting, setDeleting] = useState(false);
    const [activeNs, setActiveNs] = useState<string | null>(null);

    // Derive unique namespaces (keys that have a `/` prefix segment)
    const namespaces = useMemo(() => {
        const set = new Set<string>();
        items.forEach((item) => {
            const ns = getNamespace(item.key);
            if (ns) set.add(ns);
        });
        return Array.from(set).sort();
    }, [items]);

    const filteredItems = useMemo(() => {
        if (!activeNs) return items;
        return items.filter((item) => getNamespace(item.key) === activeNs);
    }, [items, activeNs]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { items: data } = await listConfigItems({ limit: 200 });
            setItems(data);
        } catch (e: any) {
            toast.error(e.message ?? "Failed to load config");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && user?.role === "admin") {
            load();
        }
    }, [authLoading, user, load]);

    const handleSave = async (data: { key: string; value: ConfigValue; description: string }) => {
        if (editTarget) {
            await updateConfigItem(editTarget.key, { value: data.value, description: data.description });
            toast.success(`Updated "${editTarget.key}"`);
        } else {
            await createConfigItem(data);
            toast.success(`Created "${data.key}"`);
        }
        await Promise.all([load(), refetchConfig()]);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteConfigItem(deleteTarget.key);
            toast.success(`Deleted "${deleteTarget.key}"`);
            setDeleteTarget(undefined);
            await Promise.all([load(), refetchConfig()]);
        } catch (e: any) {
            toast.error(e.message ?? "Failed to delete");
        } finally {
            setDeleting(false);
        }
    };

    if (authLoading) {
        return (
            <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Settings2 className="h-6 w-6 text-primary" />
                            System Config
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Manage application-wide configuration variables
                        </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={load} title="Refresh">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                        onClick={() => {
                            setEditTarget(undefined);
                            setDialogOpen(true);
                        }}
                        className="gap-2"
                    >
                        <Plus className="h-4 w-4" />
                        Add Variable
                    </Button>
                </div>

                {/* Namespace filter bar */}
                {!loading && namespaces.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground shrink-0">Filter:</span>
                        <button
                            type="button"
                            onClick={() => setActiveNs(null)}
                            className={`px-3 py-1 rounded-full border text-xs font-mono transition-colors ${
                                activeNs === null
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "border-border text-muted-foreground hover:border-primary/50"
                            }`}
                        >
                            All
                        </button>
                        {namespaces.map((ns) => (
                            <button
                                key={ns}
                                type="button"
                                onClick={() => setActiveNs(activeNs === ns ? null : ns)}
                                className={`px-3 py-1 rounded-full border text-xs font-mono transition-colors ${
                                    activeNs === ns
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-border text-muted-foreground hover:border-primary/50"
                                }`}
                            >
                                {ns}
                            </button>
                        ))}
                    </div>
                )}

                {/* Config table */}
                <div className="rounded-xl border bg-card overflow-hidden">
                    {loading ? (
                        <div className="p-6 space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-14 w-full" />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="py-20 text-center text-muted-foreground">
                            <Settings2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">No config variables yet</p>
                            <p className="text-sm mt-1">Create your first one to get started.</p>
                            <Button
                                className="mt-4 gap-2"
                                onClick={() => {
                                    setEditTarget(undefined);
                                    setDialogOpen(true);
                                }}
                            >
                                <Plus className="h-4 w-4" />
                                Add Variable
                            </Button>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="py-12 text-center text-muted-foreground">
                            <p className="text-sm">No variables in namespace <span className="font-mono font-semibold">{activeNs}</span>.</p>
                            <button
                                type="button"
                                onClick={() => setActiveNs(null)}
                                className="mt-2 text-xs underline underline-offset-2 hover:text-foreground transition-colors"
                            >
                                Clear filter
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredItems.map((item) => {
                                const type = detectType(item.value);
                                return (
                                    <div
                                        key={item._id}
                                        className="flex items-start gap-4 p-4 hover:bg-muted/40 transition-colors group"
                                    >
                                        {/* Key + meta */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-sm font-semibold">
                                                    {item.key}
                                                </span>
                                                <ValueTypeBadge type={type} />
                                            </div>
                                            {item.description && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {item.description}
                                                </p>
                                            )}
                                        </div>

                                        {/* Value */}
                                        <div className="flex-shrink-0 max-w-[220px] text-right">
                                            <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded break-all">
                                                {valueToDisplayString(item.value)}
                                            </span>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => {
                                                    setEditTarget(item);
                                                    setDialogOpen(true);
                                                }}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                onClick={() => setDeleteTarget(item)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Count footer */}
                {!loading && items.length > 0 && (
                    <p className="text-xs text-muted-foreground text-right">
                        {activeNs
                            ? `${filteredItems.length} of ${items.length} variable${items.length !== 1 ? "s" : ""} in "${activeNs}"`
                            : `${items.length} variable${items.length !== 1 ? "s" : ""}`}
                    </p>
                )}
            </div>

            {/* Create/Edit dialog */}
            <ConfigFormDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                initial={editTarget}
                onSave={handleSave}
            />

            {/* Delete confirm */}
            <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(undefined)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete config variable?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove{" "}
                            <span className="font-mono font-semibold">{deleteTarget?.key}</span>. This
                            action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting ? "Deleting…" : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
