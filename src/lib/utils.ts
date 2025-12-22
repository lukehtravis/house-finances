import { format } from "date-fns";
import type { FirestoreError } from "firebase/firestore";

/**
 * Convert Firestore errors to user-friendly messages
 */
export function getFirestoreErrorMessage(error: FirestoreError | null): string {
  if (!error) return "An unknown error occurred.";

  // Common Firestore error codes
  switch (error.code) {
    case "permission-denied":
      return "You don't have permission to perform this action. Please check your access settings.";
    case "unauthenticated":
      return "You need to be authenticated to perform this action.";
    case "not-found":
      return "The requested item was not found.";
    case "already-exists":
      return "This item already exists.";
    case "failed-precondition":
      return "This operation cannot be completed at this time. Please try again.";
    case "aborted":
      return "The operation was cancelled. Please try again.";
    case "deadline-exceeded":
      return "The operation took too long. Please try again.";
    case "resource-exhausted":
      return "Too many requests. Please wait a moment and try again.";
    case "unavailable":
      return "The service is temporarily unavailable. Please try again later.";
    case "internal":
      return "An internal error occurred. Please try again.";
    case "cancelled":
      return "The operation was cancelled.";
    case "data-loss":
      return "Data was lost during the operation. Please try again.";
    case "unimplemented":
      return "This feature is not yet implemented.";
    case "invalid-argument":
      return "Invalid data provided. Please check your input and try again.";
    case "out-of-range":
      return "The value is out of the allowed range.";
    default:
      // For unknown errors, try to extract a meaningful message
      if (error.message) {
        // If the message is already user-friendly, use it
        if (
          error.message.includes("permission") ||
          error.message.includes("Permission")
        ) {
          return "You don't have permission to perform this action.";
        }
        // Otherwise, return a generic message with the error code
        return `An error occurred: ${error.message}`;
      }
      return "An unexpected error occurred. Please try again.";
  }
}

/**
 * Format a date consistently across the app
 * Format: "January 15, 2025"
 */
export function formatDate(date: Date | string | number): string {
  const dateObj = typeof date === "string" ? new Date(date) : new Date(date);
  return format(dateObj, "MMMM d, yyyy");
}

/**
 * Format a month key (YYYY-MM) to a readable format
 * Format: "January 2025"
 */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return format(new Date(year, month - 1, 1), "MMMM yyyy");
}

/**
 * Format a date for display in tables (shorter format)
 * Format: "Jan 15, 2025"
 */
export function formatDateShort(date: Date | string | number): string {
  const dateObj = typeof date === "string" ? new Date(date) : new Date(date);
  return format(dateObj, "MMM d, yyyy");
}

/**
 * Format currency consistently
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/**
 * Get the current date in Pacific Standard Time (PST/PDT)
 */
export function getCurrentPSTDate(): Date {
  const now = new Date();
  // Convert to PST/PDT (UTC-8 or UTC-7 depending on DST)
  const pstDateString = now.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // Parse the date string (format: "MM/DD/YYYY")
  const [month, day, year] = pstDateString.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get the current date string in YYYY-MM-DD format in PST
 */
export function getCurrentPSTDateString(): string {
  const pstDate = getCurrentPSTDate();
  return format(pstDate, "yyyy-MM-dd");
}

/**
 * Check if a month (by monthKey) has passed in PST time
 * A month is considered "finalized" if the current PST date is past the end of that month
 */
export function isMonthFinalized(monthKey: string): boolean {
  const [year, month] = monthKey.split("-").map(Number);
  // Get the last day of the month
  const lastDayOfMonth = new Date(year, month, 0); // Day 0 of next month = last day of current month
  const currentPST = getCurrentPSTDate();
  
  // Month is finalized if current date is past the last day of that month
  return currentPST > lastDayOfMonth;
}

