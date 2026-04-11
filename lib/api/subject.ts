/**
 * Subject API Service
 * Handles all subject-related API operations for academic management
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export type SubjectType = 'Theory' | 'Practical';

export interface Subject {
  _id: string; // Custom ID like "CS101"
  name: string;
  sem: string;
  subject_code: string;
  type: SubjectType;
  total_marks: number;
  pass_mark: number;
  faculty_in_charge: string[];
}

export interface ApiResponse<T> {
  status_code: number;
  message: string;
  data: T;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListSubjectsResponse {
  subjects: Subject[];
  pagination: PaginationInfo;
}

export interface ListSubjectsParams {
  page?: number;
  limit?: number;
  sem?: string;
  type?: SubjectType;
}

export interface CreateSubjectData {
  name: string;
  sem: string;
  subject_code: string;
  type: SubjectType;
  total_marks: number;
  pass_mark: number;
  faculty_in_charge?: string[];
}

export interface UpdateSubjectData {
  sem?: string;
  subject_code?: string;
  type?: SubjectType;
  total_marks?: number;
  pass_mark?: number;
  faculty_in_charge?: string[];
}

/**
 * List subjects with pagination and filtering (staff only)
 */
export async function listSubjects(params?: ListSubjectsParams): Promise<ListSubjectsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.sem) queryParams.append('sem', params.sem);
  if (params?.type) queryParams.append('type', params.type);

  const response = await fetch(`${API_BASE}/academics/subject?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch subjects');
  }

  const result: ApiResponse<ListSubjectsResponse> = await response.json();
  return result.data;
}

/**
 * Get a specific subject by ID
 */
export async function getSubjectById(id: string): Promise<Subject> {
  const response = await fetch(`${API_BASE}/academics/subject/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch subject');
  }

  const result: ApiResponse<Subject> = await response.json();
  return result.data;
}

/**
 * Create a new subject (admin only)
 */
export async function createSubject(data: CreateSubjectData): Promise<Subject> {
  const response = await fetch(`${API_BASE}/academics/subject`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result: ApiResponse<Subject> = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Failed to create subject');
  }

  return result.data;
}

/**
 * Update a subject by ID (admin only)
 */
export async function updateSubjectById(id: string, data: UpdateSubjectData): Promise<Subject> {
  const response = await fetch(`${API_BASE}/academics/subject/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  const result: ApiResponse<Subject> = await response.json();

  if (!response.ok) {
    throw new Error(result.message || 'Failed to update subject');
  }

  return result.data;
}

/**
 * Delete a subject by ID (admin only)
 */
export async function deleteSubjectById(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/academics/subject/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete subject');
  }
}

export type CreateSubjectsBulkResponse = ApiResponse<{
  success?: Array<{ name: string; subjectId?: string }>;
  failed?: Array<{ name?: string; error?: string }>;
}> & { httpStatus: number };

export async function createSubjectsBulk(subjects: Partial<CreateSubjectData>[]): Promise<CreateSubjectsBulkResponse> {
  const success: Array<{ name: string; subjectId?: string }> = [];
  const failed: Array<{ name?: string; error?: string }> = [];
  
  for (const subject of subjects) {
    try {
      const res = await createSubject(subject as CreateSubjectData);
      success.push({ name: subject.name || 'Unknown', subjectId: res._id });
    } catch (err: any) {
      failed.push({ name: subject.name || 'Unknown', error: err.message });
    }
  }

  const httpStatus = failed.length > 0 ? (success.length > 0 ? 207 : 422) : 200;

  return {
    status_code: httpStatus,
    message: failed.length > 0 ? `Completed with ${failed.length} failures` : "Successfully created all subjects",
    data: { success, failed },
    httpStatus
  };
}
