/**
 * @nazareth/db — row types for PostgreSQL records.
 * These mirror the DDL in migrations/ and are shared across the codebase.
 */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  date_format: string;
  default_language: string;
  settings: Record<string, unknown>;
  logo_file_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  org_id: string;
  code: string;
  name: string;
  is_primary: boolean;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  deleted_at: string | null;
}

export interface User {
  id: string;
  org_id: string;
  branch_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  avatar_file_id: string | null;
  password_hash: string;
  must_change_password: boolean;
  email_verified_at: string | null;
  totp_secret: string | null;
  is_active: boolean;
  failed_logins: number;
  locked_until: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  last_seen_at: string | null;
  member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  org_id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
}

export interface Member {
  id: string;
  org_id: string;
  branch_id: string;
  user_id: string | null;
  member_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  preferred_name: string | null;
  gender: 'male' | 'female' | 'other' | null;
  date_of_birth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  avatar_file_id: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: string;
  member_type: string;
  date_joined: string | null;
  first_attendance: string | null;
  baptism_status: string;
  baptism_date: string | null;
  confirmation_status: string;
  confirmation_date: string | null;
  previous_church: string | null;
  skills: string[];
  interests: string[];
  volunteer: boolean;
  notes: string | null;
  is_demo: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Visitor {
  id: string;
  org_id: string;
  branch_id: string;
  service_id: string | null;
  visit_date: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  heard_from: string | null;
  invited_by: string | null;
  interests: string[];
  followup_status: string;
  assigned_to: string | null;
  note: string | null;
  converted_member_id: string | null;
  converted_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ministry {
  id: string;
  org_id: string;
  branch_id: string;
  name: string;
  description: string | null;
  leader_id: string | null;
  assistant_leader_id: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  location: string | null;
  is_active: boolean;
  deleted_at: string | null;
}

export interface Group {
  id: string;
  org_id: string;
  branch_id: string;
  name: string;
  type: string;
  description: string | null;
  leader_id: string | null;
  assistant_leader_id: string | null;
  location: string | null;
  meeting_day: string | null;
  meeting_time: string | null;
  is_active: boolean;
  deleted_at: string | null;
}

export interface GivingTransaction {
  id: string;
  org_id: string;
  branch_id: string;
  fund_id: string;
  member_id: string | null;
  user_id: string | null;
  amount: string;
  tx_date: string;
  method: string;
  reference: string | null;
  is_anonymous: boolean;
  status: string;
  reversed_by: string | null;
  reversal_reason: string | null;
  note: string | null;
  receipt_no: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  org_id: string;
  branch_id: string;
  fund_id: string;
  category_id: string;
  title: string;
  description: string | null;
  amount: string;
  expense_date: string;
  vendor: string | null;
  method: string;
  reference: string | null;
  receipt_file_id: string | null;
  status: string;
  submitted_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  paid_at: string | null;
  note: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PastoralCase {
  id: string;
  org_id: string;
  branch_id: string | null;
  member_id: string;
  type: string;
  title: string;
  status: string;
  assigned_to: string | null;
  opened_at: string;
  closed_at: string | null;
  resolution: string | null;
  deleted_at: string | null;
  created_at: string;
}
