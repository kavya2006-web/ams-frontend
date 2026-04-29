/**
 * Attendance Record API Service
 * Handles all attendance record-related API operations
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  _id: string;
  student: {
    _id: string;
    user: {
      name: string;
      email: string;
      first_name: string;
      last_name: string;
    };
  };
  session: {
    _id: string;
    batch: {
      _id: string;
      name: string;
      code: string;
      year: number;
    };
    subject: {
      _id: string;
      name: string;
      code: string;
      sem?: string | number;
      semester?: string | number;
    };
  };
  marked_by: {
    _id: string;
    user: {
      name: string;
      email: string;
      first_name: string;
      last_name: string;
    };
  };
  status: AttendanceStatus;
  remarks: string;
  marked_at: string;
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

export interface ListRecordsResponse {
  records: AttendanceRecord[];
  pagination: PaginationInfo;
}

export interface ListRecordsParams {
  page?: number;
  limit?: number;
  session?: string;
  student?: string;
  status?: AttendanceStatus;
  from_date?: string; // YYYY-MM-DD
  to_date?: string;   // YYYY-MM-DD
}

export interface CreateRecordData {
  session: string;
  student: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface BulkRecordData {
  student: string;
  status: AttendanceStatus;
  remarks?: string;
}

export interface CreateBulkRecordsData {
  session: string;
  records: BulkRecordData[];
}

export interface BulkCreateResponse {
  created: AttendanceRecord[];
  errors: {
    student: string;
    message: string;
  }[];
}

export interface UpdateRecordData {
  status?: AttendanceStatus;
  remarks?: string;
}

/**
 * List attendance records with pagination and filtering (staff and students)
 * 
 * **Permission Rules:**
 * - Staff can view all records
 * - Students can only view their own records (automatically filtered by API)
 */
export async function listAttendanceRecords(params?: ListRecordsParams): Promise<ListRecordsResponse> {
  const queryParams = new URLSearchParams();
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.limit) queryParams.append('limit', params.limit.toString());
  if (params?.session) queryParams.append('session', params.session);
  if (params?.student) queryParams.append('student', params.student);
  if (params?.status) queryParams.append('status', params.status);
  if (params?.from_date) queryParams.append('from_date', params.from_date);
  if (params?.to_date) queryParams.append('to_date', params.to_date);

  const response = await fetch(`${API_BASE}/attendance/record?${queryParams.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch attendance records');
  }

  const result: ApiResponse<ListRecordsResponse> = await response.json();
  return result.data;
}

/**
 * Get a specific attendance record by ID
 */
export async function getAttendanceRecordById(id: string): Promise<AttendanceRecord> {
  const response = await fetch(`${API_BASE}/attendance/record/${id}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch attendance record');
  }

  const result: ApiResponse<AttendanceRecord> = await response.json();
  return result.data;
}

/**
 * Create a single attendance record (staff only)
 */
export async function createAttendanceRecord(data: CreateRecordData): Promise<AttendanceRecord> {
  const response = await fetch(`${API_BASE}/attendance/record`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create attendance record');
  }

  const result: ApiResponse<AttendanceRecord> = await response.json();
  return result.data;
}

/**
 * Create multiple attendance records at once (staff only)
 */
export async function createBulkAttendanceRecords(data: CreateBulkRecordsData): Promise<BulkCreateResponse> {
  const response = await fetch(`${API_BASE}/attendance/record/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create bulk attendance records');
  }

  const result: ApiResponse<BulkCreateResponse> = await response.json();
  return result.data;
}

/**
 * Update an existing attendance record (staff only)
 */
export async function updateAttendanceRecordById(id: string, data: UpdateRecordData): Promise<AttendanceRecord> {
  const response = await fetch(`${API_BASE}/attendance/record/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update attendance record');
  }

  const result: ApiResponse<AttendanceRecord> = await response.json();
  return result.data;
}

/**
 * Delete an attendance record (staff only)
 */
export async function deleteAttendanceRecordById(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/attendance/record/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete attendance record');
  }
}
