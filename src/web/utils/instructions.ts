/**
 * Formats and appends an automatic, timestamped action entry to user instructions.
 * Preserves existing manual notes while maintaining a clean audit trail.
 */
export function appendAutoInstruction(note: string, currentInstructions = ''): string {
  const current = (currentInstructions || '').trim();
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatted = `[${timestamp}] ${note}`;
  if (!current) return formatted;
  return `${current}\n${formatted}`;
}
