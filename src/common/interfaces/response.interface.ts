interface ErrorResponse {
  path: string;
  error: string;
  stack?: string; // Only in development
  success: false;
  message: string;
  timestamp: string;
  statusCode: number;
  errors?: ValidationError[];
}

interface PaginatedData<T> {
  items: T[];
  meta: PaginationMeta;
}

interface PaginationMeta {
  page: number;
  total: number;
  perPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface SuccessResponse<T = any> {
  data?: T;
  path: string;
  message: string;
  success: boolean;
  timestamp: string;
  statusCode: number;
}

interface ValidationError {
  value?: any;
  field: string;
  message: string;
}

export type { ErrorResponse, PaginatedData, PaginationMeta, SuccessResponse, ValidationError };
