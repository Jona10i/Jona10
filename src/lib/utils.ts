import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format as fnsFormat, formatDistanceToNow as fnsFormatDistanceToNow } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(dateInput: any, formatStr: string): string {
  if (!dateInput) return '';
  let d: Date;
  try {
    if (dateInput instanceof Date) {
      d = dateInput;
    } else if (typeof dateInput === 'number') {
      d = new Date(dateInput);
    } else if (typeof dateInput === 'object') {
      if (typeof dateInput.seconds === 'number') {
        d = new Date(dateInput.seconds * 1000);
      } else if (typeof dateInput.toDate === 'function') {
        try {
          d = dateInput.toDate();
        } catch (_) {
          d = new Date();
        }
      } else if (typeof dateInput.toMillis === 'function') {
        try {
          d = new Date(dateInput.toMillis());
        } catch (_) {
          d = new Date();
        }
      } else {
        const parsed = new Date(dateInput);
        d = isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    } else {
      const parsed = new Date(dateInput);
      d = isNaN(parsed.getTime()) ? new Date() : parsed;
    }
  } catch (_) {
    d = new Date();
  }

  if (isNaN(d.getTime())) {
    return '';
  }
  try {
    return fnsFormat(d, formatStr);
  } catch (_) {
    return '';
  }
}

export function formatDistanceToNow(dateInput: any, options?: any): string {
  if (!dateInput) return '';
  let d: Date;
  try {
    if (dateInput instanceof Date) {
      d = dateInput;
    } else if (typeof dateInput === 'number') {
      d = new Date(dateInput);
    } else if (typeof dateInput === 'object') {
      if (typeof dateInput.seconds === 'number') {
        d = new Date(dateInput.seconds * 1000);
      } else if (typeof dateInput.toDate === 'function') {
        try {
          d = dateInput.toDate();
        } catch (_) {
          d = new Date();
        }
      } else if (typeof dateInput.toMillis === 'function') {
        try {
          d = new Date(dateInput.toMillis());
        } catch (_) {
          d = new Date();
        }
      } else {
        const parsed = new Date(dateInput);
        d = isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    } else {
      const parsed = new Date(dateInput);
      d = isNaN(parsed.getTime()) ? new Date() : parsed;
    }
  } catch (_) {
    d = new Date();
  }

  if (isNaN(d.getTime())) {
    return '';
  }
  try {
    return fnsFormatDistanceToNow(d, options);
  } catch (_) {
    return '';
  }
}

