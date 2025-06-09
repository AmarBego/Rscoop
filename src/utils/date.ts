export function formatIsoDate(isoString: string): string {
  if (!isoString) {
    return 'N/A';
  }
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
        return 'Invalid Date';
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (error) {
    console.error('Failed to format date:', isoString, error);
    return 'Invalid Date';
  }
} 