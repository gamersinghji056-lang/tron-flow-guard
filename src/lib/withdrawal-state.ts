const submittedWithdrawalKeys = new Set<string>();

export function rememberWithdrawalIdempotency(userId: string, key: string): boolean {
  const compound = `${userId}:${key}`;
  if (submittedWithdrawalKeys.has(compound)) return false;
  submittedWithdrawalKeys.add(compound);
  return true;
}

export function clearWithdrawalIdempotencyForTests(): void {
  submittedWithdrawalKeys.clear();
}
