"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Users, Clock, CheckSquare, Hand, FileText } from "lucide-react";
import GreetingHeader from "@/components/student/greeting-header";
import ClassAttendanceOverview from "@/components/teacher/class-attendance-overview";
import TeacherNotifications from "@/components/teacher/teacher-notifications";
import { format } from "date-fns";

// TODO: Replace with actual API calls
const dummyClasses = [
    {
        id: "CLS001",
        courseName: "Data Structures and Algorithms",
        courseCode: "CS301",
        batch: "IT",
        year: 3,
        section: "A",
        studentCount: 45,
        schedule: [
            { day: "Monday", time: "9:00 AM - 10:30 AM" },
            { day: "Wednesday", time: "2:00 PM - 3:30 PM" },
        ],
    },
    {
        id: "CLS002",
        courseName: "Database Management Systems",
        courseCode: "CS302",
        batch: "CSE",
        year: 3,
        section: "B",
        studentCount: 50,
        schedule: [
            { day: "Tuesday", time: "10:30 AM - 12:00 PM" },
            { day: "Thursday", time: "9:00 AM - 10:30 AM" },
        ],
    },
    {
        id: "CLS003",
        courseName: "Operating Systems",
        courseCode: "CS303",
        batch: "IT",
        year: 3,
        section: "B",
        studentCount: 42,
        schedule: [
            { day: "Monday", time: "2:00 PM - 3:30 PM" },
            { day: "Friday", time: "9:00 AM - 10:30 AM" },
        ],
    },
    {
        id: "CLS004",
        courseName: "Computer Networks",
        courseCode: "CS304",
        batch: "CSE",
        year: 3,
        section: "A",
        studentCount: 48,
        schedule: [
            { day: "Wednesday", time: "9:00 AM - 10:30 AM" },
            { day: "Friday", time: "2:00 PM - 3:30 PM" },
        ],
    },
];

const dummyAttendanceData = [
    { className: "Data Structures", classCode: "CS301", totalClasses: 45, averageAttendance: 84, trend: "up" as const },
    { className: "Database Management", classCode: "CS302", totalClasses: 40, averageAttendance: 88, trend: "up" as const },
    { className: "Operating Systems", classCode: "CS303", totalClasses: 42, averageAttendance: 67, trend: "down" as const },
    { className: "Computer Networks", classCode: "CS304", totalClasses: 38, averageAttendance: 76, trend: "stable" as const },
];

const dummyNotifications = [
    {
        id: "1",
        title: "Mid-Semester Exam Schedule",
        message: "Exams will be conducted from Jan 25-30. Please prepare accordingly.",
        type: "announcement" as const,
        postedBy: "Dr. John Doe",
        postedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        targetClass: "CS301",
    },
    {
        id: "2",
        title: "Lab Session Rescheduled",
        message: "Tomorrow's lab is moved to 2:00 PM.",
        type: "warning" as const,
        postedBy: "Dr. John Doe",
        postedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
    },
];

export default function TeacherHome() {
    const { user } = useAuth();
    const router = useRouter();
    const [selectedClass, setSelectedClass] = useState<typeof dummyClasses[0] | null>(null);
    const [isAttendanceDialogOpen, setIsAttendanceDialogOpen] = useState(false);

    const handleClassClick = (classItem: typeof dummyClasses[0]) => {
        setSelectedClass(classItem);
        setIsAttendanceDialogOpen(true);
    };

    const handleAttendanceMethod = (method: string) => {
        setIsAttendanceDialogOpen(false);
        router.push(`/dashboard/attendance?classId=${selectedClass?.id}&method=${method}`);
    };

    return (
        <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6">
            {/* Greeting Header */}
            <GreetingHeader userName={user?.firstName || user?.name || "Teacher"} />

            {/* Classes Section - Quick Access */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-semibold">Your Classes</h2>
                    <p className="text-sm text-muted-foreground">Click to take attendance</p>
                </div>

                {/* Mobile: Horizontal Scroll, Desktop: Grid */}
                <div className="md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-4 ml-0 flex md:flex-none overflow-x-auto gap-4 pb-4 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory md:snap-none scrollbar-hide">
                    {dummyClasses.map((classItem) => (
                        <Card
                            key={classItem.id}
                            className="hover:shadow-md transition-all cursor-pointer hover:border-primary min-w-70 md:min-w-0 snap-start shrink-0"
                            onClick={() => handleClassClick(classItem)}
                        >
                            <CardHeader className="pb-3">
                                <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <BookOpen className="h-5 w-5 text-primary" />
                                        <Badge variant="secondary" className="text-xs">
                                            {classItem.batch} {classItem.section}
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-base leading-tight">
                                        {classItem.courseName}
                                    </CardTitle>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        {classItem.courseCode}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Users className="h-4 w-4" />
                                    <span>{classItem.studentCount} students</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>Year {classItem.year}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Main Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Analytics */}
                <div className="space-y-6">
                    <ClassAttendanceOverview attendance={dummyAttendanceData} />
                </div>

                {/* Right Column - Notifications */}
                <div className="space-y-6">
                    <TeacherNotifications
                        notifications={dummyNotifications}
                        teacherName={user?.name || "Teacher"}
                    />
                </div>
            </div>

            {/* Attendance Method Selection Dialog */}
            <Dialog open={isAttendanceDialogOpen} onOpenChange={setIsAttendanceDialogOpen}>
                <DialogContent className="sm:max-w-150">
                    <DialogHeader>
                        <DialogTitle>Choose Attendance Marking Method</DialogTitle>
                        <DialogDescription>
                            Select how you want to mark attendance for this class session
                        </DialogDescription>
                    </DialogHeader>
                    {selectedClass && (
                        <div className="space-y-1 -mt-2">
                            <p className="font-semibold text-foreground">
                                {selectedClass.courseName} ({selectedClass.courseCode})
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {selectedClass.batch} {selectedClass.section} • {selectedClass.studentCount} students
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {format(new Date(), "EEEE, MMMM dd, yyyy • hh:mm a")}
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4">
                        {/* Swiping Method */}
                        <Button
                            variant="outline"
                            className="h-auto flex-col gap-3 p-6 hover:border-primary hover:bg-primary/5"
                            onClick={() => handleAttendanceMethod("swipe")}
                        >
                            <Hand className="h-10 w-10" />
                            <div className="text-center space-y-1">
                                <p className="font-semibold">Swipe Method</p>
                                <p className="text-xs text-muted-foreground">
                                    Swipe cards for each student
                                </p>
                            </div>
                        </Button>

                        {/* Tick Method */}
                        <Button
                            variant="outline"
                            className="h-auto flex-col gap-3 p-6 hover:border-primary hover:bg-primary/5"
                            onClick={() => handleAttendanceMethod("tick")}
                        >
                            <CheckSquare className="h-10 w-10" />
                            <div className="text-center space-y-1">
                                <p className="font-semibold">Tick Method</p>
                                <p className="text-xs text-muted-foreground">
                                    Check boxes for present students
                                </p>
                            </div>
                        </Button>

                        {/* CSV Method */}
                        <Button
                            variant="outline"
                            className="h-auto flex-col gap-3 p-6 hover:border-primary hover:bg-primary/5"
                            onClick={() => handleAttendanceMethod("csv")}
                        >
                            <FileText className="h-10 w-10" />
                            <div className="text-center space-y-1">
                                <p className="font-semibold">CSV Method</p>
                                <p className="text-xs text-muted-foreground">
                                    Enter roll numbers with commas
                                </p>
                            </div>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
