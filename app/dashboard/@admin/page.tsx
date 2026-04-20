"use client";

import { useAuth } from "@/lib/auth-context";
import GreetingHeader from "@/components/student/greeting-header";

export default function AdminDashboardPage() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6">
      {/* Greeting Header */}
      <GreetingHeader userName={user?.first_name || user?.name || "Student"} />

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        ADMIN DASHBOARD
      </div>
    </div>
  );
}