/**
 * @nazareth/shared — shared enums / constants.
 * Values stored in the database must stay in sync with these strings.
 */

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

/** Configurable membership statuses (seeded; administrators can add more). */
export const DEFAULT_MEMBER_STATUSES = [
  { code: 'visitor', name: 'Visitor', color: '#94a3b8', active: true, system: true },
  { code: 'new_member', name: 'New Member', color: '#3b82f6', active: true, system: true },
  { code: 'active', name: 'Active Member', color: '#16a34a', active: true, system: true },
  { code: 'inactive', name: 'Inactive', color: '#f59e0b', active: true, system: true },
  { code: 'transferred', name: 'Transferred', color: '#8b5cf6', active: true, system: true },
  { code: 'moved_away', name: 'Moved Away', color: '#0ea5e9', active: true, system: true },
  { code: 'deceased', name: 'Deceased', color: '#475569', active: true, system: true },
  { code: 'archived', name: 'Archived', color: '#64748b', active: true, system: true },
] as const;

export type MemberStatusCode = (typeof DEFAULT_MEMBER_STATUSES)[number]['code'];

export const BAPTISM_STATUSES = ['none', 'baptized', 'pending', 'not_applicable'] as const;
export type BaptismStatus = (typeof BAPTISM_STATUSES)[number];
export const CONFIRMATION_STATUSES = ['none', 'confirmed', 'pending', 'not_applicable'] as const;
export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

export const RELATIONSHIP_TYPES = ['spouse', 'parent', 'child', 'sibling', 'household'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const FAMILY_MEMBER_ROLES = ['head', 'spouse', 'child', 'other'] as const;
export type FamilyMemberRole = (typeof FAMILY_MEMBER_ROLES)[number];

export const VISITOR_FOLLOWUP_STATUSES = ['none', 'planned', 'contacted', 'converted', 'closed'] as const;
export type VisitorFollowupStatus = (typeof VISITOR_FOLLOWUP_STATUSES)[number];

export const HEARD_FROM_OPTIONS = [
  'friend', 'family', 'online', 'social_media', 'search_engine', 'billboard', 'sign', 'radio_tv', 'work', 'neighbor', 'other',
] as const;

export const LEADER_ROLES = ['leader', 'assistant', 'member'] as const;
export type LeaderRole = (typeof LEADER_ROLES)[number];

export const SERVICE_CATEGORIES = [
  { code: 'sunday', name: 'Sunday Service' },
  { code: 'midweek', name: 'Midweek Service' },
  { code: 'bible_study', name: 'Bible Study' },
  { code: 'prayer_meeting', name: 'Prayer Meeting' },
  { code: 'youth', name: 'Youth Meeting' },
  { code: 'children', name: "Children's Meeting" },
  { code: 'ministry', name: 'Ministry Meeting' },
  { code: 'special', name: 'Special Event' },
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number]['code'];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused', 'visitor', 'first_time'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const EVENT_STATUSES = ['draft', 'published', 'completed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_VISIBILITY = ['public', 'members', 'ministry', 'group'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

export const EVENT_REG_STATUSES = ['registered', 'attended', 'absent', 'cancelled'] as const;
export type EventRegStatus = (typeof EVENT_REG_STATUSES)[number];

export const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'published', 'expired'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const PASTORAL_CASE_TYPES = [
  { code: 'counseling', name: 'Counseling' },
  { code: 'home_visit', name: 'Home Visit' },
  { code: 'hospital_visit', name: 'Hospital Visit' },
  { code: 'bereavement', name: 'Bereavement' },
  { code: 'marriage_support', name: 'Marriage Support' },
  { code: 'crisis_support', name: 'Crisis Support' },
  { code: 'followup', name: 'Pastoral Follow-up' },
] as const;
export type PastoralCaseType = (typeof PASTORAL_CASE_TYPES)[number]['code'];

export const PASTORAL_CASE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type PastoralCaseStatus = (typeof PASTORAL_CASE_STATUSES)[number];

export const PRAYER_CATEGORIES = ['health', 'family', 'financial', 'work', 'spiritual', 'gratitude', 'other'] as const;
export type PrayerCategory = (typeof PRAYER_CATEGORIES)[number];

export const PRAYER_VISIBILITY = ['private', 'pastoral', 'ministry', 'group', 'church'] as const;
export type PrayerVisibility = (typeof PRAYER_VISIBILITY)[number];

export const PRAYER_STATUSES = ['active', 'prayed', 'closed'] as const;
export type PrayerStatus = (typeof PRAYER_STATUSES)[number];

export const FOLLOWUP_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export const FOLLOWUP_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type FollowupPriority = (typeof FOLLOWUP_PRIORITIES)[number];

export const FOLLOWUP_SOURCES = ['visitor', 'new_member', 'attendance', 'prayer', 'pastoral', 'event', 'registration', 'manual'] as const;
export type FollowupSource = (typeof FOLLOWUP_SOURCES)[number];

export const PAYMENT_METHODS = ['cash', 'check', 'online', 'mobile_money', 'bank_transfer', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const GIVING_TX_STATUSES = ['recorded', 'confirmed', 'reconciled', 'reversed'] as const;
export type GivingTxStatus = (typeof GIVING_TX_STATUSES)[number];

export const EXPENSE_STATUSES = ['draft', 'submitted', 'approved', 'rejected', 'paid'] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Default giving funds created by the seeder. */
export const DEFAULT_FUNDS = [
  { code: 'general', name: 'General Fund', description: 'Regular tithe and offering' },
  { code: 'missions', name: 'Missions', description: 'Local and overseas mission work' },
  { code: 'building', name: 'Building Project', description: 'Church building and maintenance' },
  { code: 'youth', name: 'Youth Ministry', description: 'Youth ministry operations' },
  { code: 'children', name: "Children's Ministry", description: 'Children’s ministry operations' },
  { code: 'benevolence', name: 'Benevolence', description: 'Assistance to members in need' },
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'utilities', 'building', 'ministry_programs', 'supplies', 'food_hospitality', 'transport', 'media', 'personnel', 'missionary_support', 'other',
] as const;

export const FILE_KINDS = ['avatar', 'member_document', 'event_document', 'expense_receipt', 'pastoral', 'church_document', 'other'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const NOTIFICATION_TYPES = [
  'announcement', 'event_reminder', 'task_assigned', 'followup_reminder', 'prayer_update', 'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
] as const;
