"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function AdminSlotNotFound() {
    const router = useRouter();

    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center px-6">
            <div className="mb-6 p-5 rounded-2xl bg-muted">
                <FileQuestion className="h-12 w-12 text-muted-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Page not found</h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-xs">
                The page you're looking for doesn't exist or you don't have permission to view it.
            </p>
            <div className="mt-6 flex gap-3">
                <Button variant="outline" onClick={() => router.back()}>
                    Go back
                </Button>
                <Button onClick={() => router.push("/dashboard")}>
                    Dashboard
                </Button>
            </div>
        </div>
    );
}
