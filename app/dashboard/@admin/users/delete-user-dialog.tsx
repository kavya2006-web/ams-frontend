"use client";

import { User } from "@/lib/types/UserTypes";
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

interface DeleteUserDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteUserDialog({ user, open, onOpenChange, onConfirm }: DeleteUserDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              This action cannot be undone. This will permanently delete the user account for{" "}
              <span className="font-semibold">{user.name}</span> ({user.email}).
            </span>
            <span className="block text-destructive font-medium">
              All associated data including:
            </span>
            <span className="block ml-4 text-sm">• User authentication credentials</span>
            <span className="block ml-4 text-sm">• Profile information</span>
            <span className="block ml-4 text-sm">• Role-specific data ({user.role})</span>
            {user.role === 'student' && (
              <span className="block ml-4 text-sm">• Associated parent records</span>
            )}
            <span className="block text-destructive font-medium">
              will be permanently deleted from the system.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive/90"
          >
            Delete User
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
