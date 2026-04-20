"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import Loading from "@/app/loading";
import { Loader2 } from "lucide-react";

const ALLOWED_ROLES = ["admin"] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, isLoading } = useAuth();

    useEffect(() => {
        if (isLoading) return;
        if (!user || !ALLOWED_ROLES.includes(user.role as any)) {
            router.replace("/dashboard");
        }
    }, [isLoading, user, router]);

    // Show loader while auth resolves or while redirecting
    if (isLoading || !user || !ALLOWED_ROLES.includes(user.role as any)) {
        return <div className="w-full h-full flex">
            <Loader2 className="animate-spin"/>
        </div>;
    }

    return <>{children}</>;
}
