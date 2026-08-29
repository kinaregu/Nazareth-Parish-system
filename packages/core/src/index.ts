/**
 * @nazareth/core — domain layer public API.
 *
 * Layering (mirrors a NestJS module structure, framework-agnostic):
 *   controllers (apps/web route handlers)
 *     → services (this package: business rules + authorization)
 *       → repositories (scoped SQL queries, this package + @nazareth/db)
 *         → PostgreSQL
 */
export * from './errors';
export * from './config';
export * from './audit/auditService';
export * from './rbac/scope';
export * as auth from './auth/authService';
export { hashPassword, verifyPassword, randomPassword } from './auth/passwords';
export { randomToken, hashToken } from './auth/tokens';
export { totpSetupUri } from './auth/totpSetupUri';
export * as ratelimit from './auth/ratelimit';
export * as notify from './notify/notifyService';
export * as providers from './notify/providers';
export * as memberService from './members/memberService';
export * as importService from './members/importService';
export * as familyService from './families/familyService';
export * as visitorService from './visitors/visitorService';
export * as orgService from './ministries/orgService';
export * as attendanceService from './attendance/attendanceService';
export * as eventService from './events/eventService';
export * as announcementService from './announcements/announcementService';
export * as pastoralService from './pastoral/pastoralService';
export * as prayerService from './prayer/prayerService';
export * as followupService from './followups/followupService';
export * as givingService from './finance/givingService';
export * as expenseService from './finance/expenseService';
export * as reportService from './reports/reportService';
export * as userService from './users/userService';
export * as roleService from './roles/roleService';
export * as settingsService from './settings/settingsService';
export * as searchService from './search/searchService';
export * as dashboardService from './dashboard/dashboardService';
export * as registrationService from './registration/registrationService';
export * as fileService from './files/fileService';
export * as backupService from './backups/backupService';
export * as jobs from './jobs/jobs';
