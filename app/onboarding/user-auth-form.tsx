"use client"

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, LogOut } from 'lucide-react';
import { cn } from "@/lib/utils"
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Card } from '@/components/ui/card';
import { useAuth } from '@/lib/auth-context';
import type { User } from '@/lib/types/UserTypes';

const departments = [
  { value: 'CSE', label: 'CSE' },
  { value: 'ECE', label: 'ECE' },
  { value: 'IT', label: 'IT' }
];

type FormData = {
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  batch: string;
  admissionNumber: string;
  admissionYear: string;
  candidateCode: string;
  department: string;
  dateOfBirth: string;
  designation: string;
  dateOfJoining: string;
};

const parseBackendErrorPayload = (payload: unknown): { statusCode?: number; message: string; raw: string } => {
  const raw = JSON.stringify(payload ?? {}).toLowerCase();
  const p = (payload ?? {}) as {
    status_code?: number | string;
    statusCode?: number | string;
    code?: number | string;
    message?: string;
    data?: unknown;
    error?: {
      message?: string;
      status_code?: number | string;
      code?: number | string;
      data?: { status_code?: number | string; code?: number | string; message?: string };
    };
  };

  const dataObj = (p.data && typeof p.data === "object")
    ? (p.data as { status_code?: number | string; code?: number | string; message?: string })
    : undefined;

  const statusCandidates = [
    p.status_code,
    p.statusCode,
    p.code,
    dataObj?.status_code,
    dataObj?.code,
    p.error?.status_code,
    p.error?.code,
    p.error?.data?.status_code,
    p.error?.data?.code,
  ]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));

  const statusFromRaw = raw.match(/\b4221\b|\b4222\b|\b4223\b/)?.[0];
  const statusCode = statusCandidates[0] ?? (statusFromRaw ? Number(statusFromRaw) : undefined);

  const messageFromData = typeof p.data === "string"
    ? p.data
    : dataObj?.message;

  const message =
    p.message ||
    p.error?.message ||
    p.error?.data?.message ||
    messageFromData ||
    "";

  return { statusCode, message, raw };
};

const isGenericOnboardingMessage = (message: string): boolean => {
  const m = message.toLowerCase();
  if (!m) return true;

  return (
    m.includes("an error occurred while creating the user profile") ||
    m.includes("failed to complete registration") ||
    m.includes("internal server error") ||
    m.includes("something went wrong")
  );
};

const selectFieldErrorMessage = (
  message: string,
  fallback: string,
  expectedKeywords: string[]
): string => {
  if (!message.trim()) return fallback;
  const lower = message.toLowerCase();
  const hasExpectedKeyword = expectedKeywords.some((k) => lower.includes(k));

  if (isGenericOnboardingMessage(message) || !hasExpectedKeyword) {
    return fallback;
  }

  return message;
};

const mapBackendFieldErrors = (payload: unknown): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};
  const { statusCode, message, raw } = parseBackendErrorPayload(payload);

  const lowerMessage = message.toLowerCase();
  const hasAdmissionSignal =
    raw.includes("adm_number") ||
    raw.includes("admission number") ||
    raw.includes("admission no") ||
    lowerMessage.includes("admission number") ||
    lowerMessage.includes("admission no");
  const hasCandidateSignal =
    raw.includes("candidate_code") ||
    raw.includes("candidate code") ||
    lowerMessage.includes("candidate code");
  const isUniquenessConflictText =
    lowerMessage.includes("already exist") ||
    lowerMessage.includes("already exists");

  // Production backend can sometimes return only one duplicate signal even when both collide.
  // In that case, mark both fields to avoid misleading the user.
  if (
    (statusCode === 4221 || statusCode === 4222 || statusCode === 4223 || isUniquenessConflictText) &&
    (hasAdmissionSignal || hasCandidateSignal)
  ) {
    const combined = selectFieldErrorMessage(
      message,
      "Admission number and candidate code already exist for another student",
      ["admission", "candidate", "number", "code"]
    );

    if (hasAdmissionSignal && hasCandidateSignal) {
      fieldErrors.admissionNumber = combined;
      fieldErrors.candidateCode = combined;
      return fieldErrors;
    }

    if (statusCode === 4223) {
      fieldErrors.admissionNumber = combined;
      fieldErrors.candidateCode = combined;
      return fieldErrors;
    }

    // Heuristic fallback for inconsistent production responses.
    if (statusCode === 4221 || statusCode === 4222) {
      fieldErrors.admissionNumber = combined;
      fieldErrors.candidateCode = combined;
      return fieldErrors;
    }
  }

  // Always prioritize combined duplicate mapping when both signals exist,
  // even if backend status code is incorrectly sent as 4221/4222.
  if (hasAdmissionSignal && hasCandidateSignal) {
    const combined = selectFieldErrorMessage(
      message,
      "Admission number and candidate code already exist for another student",
      ["admission", "candidate", "number", "code"]
    );
    fieldErrors.admissionNumber = combined;
    fieldErrors.candidateCode = combined;
    return fieldErrors;
  }

  // Exact backend status-code mapping
  if (statusCode === 4222) {
    fieldErrors.candidateCode = selectFieldErrorMessage(
      message,
      "Candidate code already exists for another student",
      ["candidate", "code"]
    );
    return fieldErrors;
  }

  if (statusCode === 4221) {
    fieldErrors.admissionNumber = selectFieldErrorMessage(
      message,
      "Admission number already exists for another student",
      ["admission", "number"]
    );
    return fieldErrors;
  }

  if (statusCode === 4223) {
    const combinedMessage = selectFieldErrorMessage(
      message,
      "Admission number and candidate code already exist for another student",
      ["admission", "candidate", "number", "code"]
    );
    fieldErrors.admissionNumber = combinedMessage;
    fieldErrors.candidateCode = combinedMessage;
    return fieldErrors;
  }

  // Duplicate/validation mapping for student uniqueness constraints
  if (
    raw.includes("candidate_code") ||
    raw.includes("candidate code") ||
    message.toLowerCase().includes("candidate code")
  ) {
    fieldErrors.candidateCode = selectFieldErrorMessage(
      message,
      "Candidate code already exists. Please use a different value.",
      ["candidate", "code"]
    );
  }
  if (
    raw.includes("adm_year") ||
    raw.includes("admission year") ||
    message.toLowerCase().includes("admission year")
  ) {
    fieldErrors.admissionYear = selectFieldErrorMessage(
      message,
      "Admission year already exists for another student record.",
      ["admission", "year"]
    );
  }
  if (
    raw.includes("adm_number") ||
    raw.includes("admission number") ||
    message.toLowerCase().includes("admission number")
  ) {
    fieldErrors.admissionNumber = selectFieldErrorMessage(
      message,
      "Admission number already exists. Please verify and try again.",
      ["admission", "number"]
    );
  }

  // Combined duplicate fallback for production responses that don't expose granular keys.
  return fieldErrors;
};

  const FormField = ({ id, label, type = 'text', placeholder, value, error, disabled, onChange }: { id: keyof FormData; label: string; type?: string; placeholder?: string; value: string; error?: string; disabled?: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }) => (
    <div className={`space-y-2 ${disabled ? 'cursor-not-allowed' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} value={value}
        onChange={onChange} name={id} disabled={disabled} className={cn(
          disabled ? 'bg-blue-50 dark:bg-blue-950/20 opacity-75 pointer-events-none' : '',
          error ? 'border-red-500 focus-visible:ring-red-500' : ''
        )} />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
  
  const SelectField = ({ id, label, value, error, options, placeholder, disabled, onValueChange }: { id: keyof FormData; label: string; value: string; error?: string; options: { value: string; label: string }[]; placeholder: string; disabled?: boolean; onValueChange: (value: string) => void; }) => (
    <div className={`space-y-2 ${disabled ? 'cursor-not-allowed' : ''}`}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={cn(
          disabled ? 'bg-blue-50 dark:bg-blue-950/20 opacity-75 pointer-events-none' : '',
          error ? 'border-red-500 focus:ring-red-500' : ''
        )}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent position="popper" sideOffset={5}>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );

type UserAuthFormProps = React.HTMLAttributes<HTMLDivElement>

export function SignUpUserAuthForm({ className, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    firstName: '', lastName: '', phone: '', gender: '',
    batch: '',
    admissionNumber: '', admissionYear: '', candidateCode: '', department: '', dateOfBirth: '',
    designation: '', dateOfJoining: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const {user, incompleteProfile, isLoading : isPending, session, refetchUser} = useAuth();

  const ip = (incompleteProfile as any);
  const ipProfile = (ip?.profile ?? ip ?? {}) as any;
  const locked = {
    name: Boolean(incompleteProfile?.first_name || incompleteProfile?.last_name || (incompleteProfile as any)?.name),
    batch: Boolean(ipProfile?.batch),
    admissionNumber: Boolean(ipProfile?.adm_number),
    admissionYear: Boolean(ipProfile?.adm_year),
    candidateCode: Boolean(ipProfile?.candidate_code),
    department: Boolean(ipProfile?.department),
    dateOfBirth: Boolean(ipProfile?.date_of_birth),
  };

  useEffect(() => {
    if (isPending || !user) return;
    if (!session) return router.push('/signin');
    if(!incompleteProfile && user.first_name) {
      const redirectUrl = searchParams.get('r') || '/dashboard';
      return router.push(redirectUrl);
    }
    
    // Check if user has a role
    if (!user.role || (user.role == 'parent')) {
      setError('Only students and teachers can complete registration.');
      return;
    }

    const toInputDate = (value?: string) => {
      if (!value) return '';
      return value.includes('T') ? value.split('T')[0] : value;
    };

    const profile = (incompleteProfile ?? user) as User;
    const role = incompleteProfile?.role || user.role;
    const p = ((profile as any).profile ?? profile) as any;

    const fullName = profile.name || user.name || '';
    const inferredFirstName = fullName.split(' ')[0] || '';
    const inferredLastName = fullName.split(' ').slice(1).join(' ') || '';

    const batchValue = p.batch ?? (profile as any).batch;
    const batchId = typeof batchValue === 'string' ? batchValue : batchValue?._id;

    setFormData({
      firstName: profile.first_name || user.first_name || inferredFirstName,
      lastName: profile.last_name || user.last_name || inferredLastName,
      phone: String(profile.phone ?? user.phone ?? ''),
      gender: (profile.gender || user.gender || '') as string,
      batch: batchId || '',
      admissionNumber: p.adm_number || '',
      admissionYear: p.adm_year ? String(p.adm_year) : '',
      candidateCode: p.candidate_code || '',
      department: (p.department || '') as string,
      dateOfBirth: toInputDate(p.date_of_birth),
      designation: role === 'teacher' ? (p.designation || '') : '',
      dateOfJoining: toInputDate(role === 'teacher' ? p.date_of_joining : undefined),
    });

    setIsLoading(false);
  }, [incompleteProfile, isPending, router, searchParams, session, user]);
  
    const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleInputEvent = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    handleInputChange(name as keyof FormData, value);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.firstName.trim() || formData.firstName.length < 1) 
      newErrors.firstName = 'First name must be at least 1 characters';
    if (!formData.lastName.trim() || formData.lastName.length < 1) 
      newErrors.lastName = 'Last name must be at least 1 characters';
    if (!formData.phone.trim() || formData.phone.length < 10) 
      newErrors.phone = 'Phone number must be at least 10 digits';
    if (!formData.gender) newErrors.gender = 'Please select a gender';

    if (user?.role === 'student') {
      if (!formData.batch) newErrors.batch = 'Batch is required';
      if (!formData.admissionNumber.trim()) newErrors.admissionNumber = 'Required';
      if (!formData.admissionYear.trim()) newErrors.admissionYear = 'Required';
      if (!formData.candidateCode.trim()) newErrors.candidateCode = 'Required';
      if (!formData.department) newErrors.department = 'Required';
      if (!formData.dateOfBirth) newErrors.dateOfBirth = 'Required';
    } else if (user?.role === 'teacher') {
      if (!formData.designation.trim()) newErrors.designation = 'Required';
      if (!formData.department) newErrors.department = 'Required';
      if (!formData.dateOfJoining) newErrors.dateOfJoining = 'Required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      setError('Please fix the errors in the form');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Submit the completion data to backend
      const phoneNumber = Number(formData.phone.replace(/\D/g, ''));
      const admissionYear = formData.admissionYear ? Number(formData.admissionYear) : undefined;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          first_name: formData.firstName,
          last_name: formData.lastName,
          phone: phoneNumber,
          gender: formData.gender,
          profile: user?.role === 'student' ? {
            batch: formData.batch,
            adm_number: formData.admissionNumber,
            adm_year: admissionYear,
            candidate_code: formData.candidateCode,
            department: formData.department,
            date_of_birth: formData.dateOfBirth,
          } : {
            designation: formData.designation,
            department: formData.department,
            date_of_joining: formData.dateOfJoining,
          },
        }),
      });

      const responsePayload = await response.json().catch(() => ({}));
      const parsedBackendError = parseBackendErrorPayload(responsePayload);
      const normalizedStatus = Number(
        (responsePayload as { status_code?: number | string; statusCode?: number | string }).status_code ??
        (responsePayload as { status_code?: number | string; statusCode?: number | string }).statusCode ??
        parsedBackendError.statusCode ??
        response.status
      );
      const mappedFieldErrors = mapBackendFieldErrors(responsePayload);
      const isKnownUniquenessStatus = [4221, 4222, 4223].includes(Number(parsedBackendError.statusCode));

      // Some production responses return HTTP 200 while carrying uniqueness status in body.
      if (isKnownUniquenessStatus && Object.keys(mappedFieldErrors).length > 0) {
        setErrors((prev) => ({ ...prev, ...mappedFieldErrors }));
        setError(null);
        return;
      }

      if (!response.ok || normalizedStatus >= 400) {
        if (Object.keys(mappedFieldErrors).length > 0) {
          setErrors((prev) => ({ ...prev, ...mappedFieldErrors }));
          setError(null);
          return;
        }

        const { message } = parseBackendErrorPayload(responsePayload);
        throw new Error(message || 'Failed to complete registration');
      }

      await refetchUser();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/signin');
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-3xl font-bold">Hi, {user?.name?.split(' ')[0] || user?.email.split('@')[0]} 👋</h1>
        <p className="text-muted-foreground text-sm">
          Fill in your details to continue.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

    
      <form onSubmit={handleSubmit} className="space-y-4 px-4 sm:px-0">
        {/* Email Card with Sign Out */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <p className="text-sm font-medium mt-1">{user?.email}</p>
            </div>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon-sm"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Common Fields */}
        <div className="grid grid-cols-2 gap-3">
          <FormField id="firstName" label="First Name" placeholder="John" value={formData.firstName} error={errors.firstName} disabled={locked.name} onChange={handleInputEvent} />
          <FormField id="lastName" label="Last Name" placeholder="Doe" value={formData.lastName} error={errors.lastName} disabled={locked.name} onChange={handleInputEvent} />
        </div>
        <FormField id="phone" label="Phone Number" type="tel" placeholder="+91 98765 43210" value={formData.phone} error={errors.phone} onChange={handleInputEvent} />
        <SelectField id="gender" label="Gender" value={formData.gender} error={errors.gender} placeholder="Select gender"
          options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} onValueChange={(value) => handleInputChange('gender', value)} />

        {/* Role-Specific Fields */}
        {user?.role === 'student' ? (
          <>
            {/* Only show batch field if it wasn't pre-filled during bulk import */}
            {!locked.batch && (
              <FormField 
                id="batch" 
                label="Batch" 
                placeholder="e.g., 2026-2030 or IT" 
                value={formData.batch} 
                error={errors.batch} 
                disabled={locked.batch} 
                onChange={handleInputEvent} 
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField id="admissionNumber" label="Admission No." placeholder="29CSE555" value={formData.admissionNumber} error={errors.admissionNumber} disabled={locked.admissionNumber} onChange={handleInputEvent} />
              <FormField id="admissionYear" label="Admission Year" type="number" placeholder="2026" value={formData.admissionYear} error={errors.admissionYear} disabled={locked.admissionYear} onChange={handleInputEvent} />
            </div>
            <FormField id="candidateCode" label="Candidate Code" placeholder="41529505078" value={formData.candidateCode} error={errors.candidateCode} disabled={locked.candidateCode} onChange={handleInputEvent} />
            {!locked.department ? (
              <SelectField id="department" label="Department" value={formData.department} error={errors.department} placeholder="Select department" options={departments} onValueChange={(value) => handleInputChange('department', value)} />
            ) : (
              <FormField id="department" label="Department" placeholder="Department" value={formData.department} error={errors.department} disabled={locked.department} onChange={handleInputEvent} />
            )}
            <FormField id="dateOfBirth" label="Date of Birth" type="date" value={formData.dateOfBirth} error={errors.dateOfBirth} disabled={locked.dateOfBirth} onChange={handleInputEvent} />
          </>
        ): (
          <>
            <FormField id="designation" label="Designation" placeholder="Assistant Professor" value={formData.designation} error={errors.designation} onChange={handleInputEvent} />
            {!locked.department ? (
              <SelectField id="department" label="Department" value={formData.department} error={errors.department} placeholder="Select department"
                options={[{ value: 'CSE', label: 'Computer Science and Engineering' }, { value: 'ECE', label: 'Electronics and Communication Engineering' }, { value: 'IT', label: 'Information Technology' }]} onValueChange={(value) => handleInputChange('department', value)} />
            ) : (
              <FormField id="department" label="Department" placeholder="Department" value={formData.department} error={errors.department} disabled={locked.department} onChange={handleInputEvent} />
            )}
            <FormField id="dateOfJoining" label="Date of Joining" type="date" value={formData.dateOfJoining} error={errors.dateOfJoining} onChange={handleInputEvent} />
          </>
        )}

        <Button className="w-full" type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {!isLoading && "Complete Registration"}
        </Button>
      </form>

      <p className="px-6 text-center text-xs text-muted-foreground">
        By clicking continue, you agree to our{" "}
        <a href="/terms" className="underline underline-offset-4 hover:text-primary">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline underline-offset-4 hover:text-primary">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  )
}
