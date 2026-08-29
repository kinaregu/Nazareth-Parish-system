/**
 * @nazareth/core — environment access with safe dev defaults.
 * Secrets have NO working defaults in production: the process must fail fast.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export const config = {
  get nodeEnv(): string {
    return process.env.NODE_ENV || 'development';
  },
  get appUrl(): string {
    return process.env.APP_URL || 'http://localhost:3000';
  },
  get isDev(): boolean {
    return !isProduction();
  },
  get sessionIdleMinutes(): number {
    return Number(process.env.SESSION_IDLE_MINUTES || 1440);
  },
  get sessionRememberDays(): number {
    return Number(process.env.SESSION_REMEMBER_DAYS || 30);
  },
  get fileStoragePath(): string {
    return process.env.FILE_STORAGE_PATH || '.data/files';
  },
  get fileMaxSizeMb(): number {
    return Number(process.env.FILE_MAX_SIZE_MB || 8);
  },
  get fileAllowedMimes(): string[] {
    return (process.env.FILE_ALLOWED_MIMES || 'image/png,image/jpeg,image/webp,application/pdf').split(',').map((s) => s.trim());
  },
  get backupPath(): string {
    return process.env.BACKUP_PATH || '.data/backups';
  },
  get backupRetention(): number {
    return Number(process.env.BACKUP_RETENTION || 7);
  },
  get backupHour(): number {
    return Number(process.env.BACKUP_HOUR || 2);
  },
  get absenceWeeks(): { short: number; medium: number; long: number } {
    return {
      short: Number(process.env.ABSENCE_WEEKS_SHORT || 2),
      medium: Number(process.env.ABSENCE_WEEKS_MEDIUM || 4),
      long: Number(process.env.ABSENCE_WEEKS_LONG || 8),
    };
  },
};
