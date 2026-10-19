export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      sl_overtime_sessions: {
        Row: {
          id: string;
          company_id: string;
          employee_id: string;
          shift_id: string;
          started_at: string;
          original_finish_at: string;
          planned_finish_at: string;
          ended_at: string | null;
          requested_start_at: string | null;
          request_reason: string | null;
          review_status: string;
          reviewed_by: string | null;
          reviewed_at: string | null;
        };
        Insert: {
          id: string;
          company_id: string;
          employee_id: string;
          shift_id: string;
          started_at?: string;
          original_finish_at: string;
          planned_finish_at: string;
          ended_at?: string | null;
          requested_start_at?: string | null;
          request_reason?: string | null;
          review_status?: string;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["sl_overtime_sessions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sl_overtime_sessions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_overtime_sessions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_overtime_sessions_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: true;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_overtime_sessions_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_adjustments: {
        Row: {
          actor: string;
          captured_at: string;
          company_id: string;
          correction_id: string;
          created_at: string;
          employee_id: string;
          event_id: string | null;
          event_type: string;
          id: string;
          reason: string;
          shift_id: string;
        };
        Insert: {
          actor: string;
          captured_at: string;
          company_id: string;
          correction_id: string;
          created_at?: string;
          employee_id: string;
          event_id?: string | null;
          event_type: string;
          id?: string;
          reason: string;
          shift_id: string;
        };
        Update: {
          actor?: string;
          captured_at?: string;
          company_id?: string;
          correction_id?: string;
          created_at?: string;
          employee_id?: string;
          event_id?: string | null;
          event_type?: string;
          id?: string;
          reason?: string;
          shift_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_adjustments_actor_fkey";
            columns: ["actor"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_adjustments_actor_tenant_fk";
            columns: ["actor", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_adjustments_correction_id_fkey";
            columns: ["correction_id"];
            isOneToOne: true;
            referencedRelation: "sl_corrections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_adjustments_correction_id_tenant_fk";
            columns: ["correction_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_corrections";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_correction_owner_fk";
            columns: ["correction_id", "shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_corrections";
            referencedColumns: ["id", "shift_id", "employee_id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_adjustments_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_adjustments_event_id_tenant_fk";
            columns: ["event_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_event_shift_fk";
            columns: ["event_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_adjustments_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_adjustments_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_attendance_exceptions: {
        Row: {
          company_id: string;
          employee_id: string;
          id: string;
          incident_id: string;
          review_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          shift_id: string;
          status: string;
        };
        Insert: {
          company_id: string;
          employee_id: string;
          id?: string;
          incident_id: string;
          review_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          shift_id: string;
          status?: string;
        };
        Update: {
          company_id?: string;
          employee_id?: string;
          id?: string;
          incident_id?: string;
          review_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          shift_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_attendance_exceptions_incident_id_company_id_fkey";
            columns: ["incident_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_incidents";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_attendance_exceptions_reviewed_by_company_id_fkey";
            columns: ["reviewed_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_attendance_exceptions_shift_id_employee_id_company_id_fkey";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_audit: {
        Row: {
          action: string;
          actor: string;
          at: string;
          company_id: string;
          detail: Json;
          id: string;
        };
        Insert: {
          action: string;
          actor: string;
          at?: string;
          company_id: string;
          detail: Json;
          id?: string;
        };
        Update: {
          action?: string;
          actor?: string;
          at?: string;
          company_id?: string;
          detail?: Json;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_audit_actor_fkey";
            columns: ["actor"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_audit_actor_tenant_fk";
            columns: ["actor", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_audit_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_calculations: {
        Row: {
          approved_at: string;
          approved_by: string;
          calculation: Json;
          company_id: string;
          id: string;
          policy_version: number;
          shift_id: string;
          version: number;
        };
        Insert: {
          approved_at?: string;
          approved_by: string;
          calculation: Json;
          company_id: string;
          id?: string;
          policy_version: number;
          shift_id: string;
          version: number;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          calculation?: Json;
          company_id?: string;
          id?: string;
          policy_version?: number;
          shift_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_calculations_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_calculations_approved_by_tenant_fk";
            columns: ["approved_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_calculations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_calculations_policy_fk";
            columns: ["company_id", "policy_version"];
            isOneToOne: false;
            referencedRelation: "sl_policies";
            referencedColumns: ["company_id", "version"];
          },
          {
            foreignKeyName: "sl_calculations_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_calculations_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_calendar_jobs: {
        Row: {
          end_date: string;
          return_to_office: boolean;
          lunch_guidance: string;
          completed_at: string | null;
          address: string;
          company_id: string;
          created_at: string;
          created_by: string;
          date: string;
          details: string;
          employee_ids: string[];
          id: string;
          latitude: number | null;
          longitude: number | null;
          radius_m: number;
          title: string;
        };
        Insert: {
          end_date?: string;
          return_to_office?: boolean;
          lunch_guidance?: string;
          completed_at?: string | null;
          address?: string;
          company_id: string;
          created_at?: string;
          created_by: string;
          date: string;
          details: string;
          employee_ids?: string[];
          id: string;
          latitude?: number | null;
          longitude?: number | null;
          radius_m?: number;
          title: string;
        };
        Update: {
          end_date?: string;
          return_to_office?: boolean;
          lunch_guidance?: string;
          completed_at?: string | null;
          address?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          date?: string;
          details?: string;
          employee_ids?: string[];
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          radius_m?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_calendar_jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_calendar_jobs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_companies: {
        Row: {
          registration_code: string;
          logo_path: string | null;
          checkin_close_time: string;
          current_policy_version: number;
          id: string;
          name: string;
          timezone: string;
        };
        Insert: {
          registration_code?: string;
          logo_path?: string | null;
          checkin_close_time?: string;
          current_policy_version?: number;
          id?: string;
          name: string;
          timezone?: string;
        };
        Update: {
          registration_code?: string;
          logo_path?: string | null;
          checkin_close_time?: string;
          current_policy_version?: number;
          id?: string;
          name?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      sl_corrections: {
        Row: {
          actor: string;
          approved_at: string | null;
          approved_by_level_1: string | null;
          approved_by_level_2: string | null;
          company_id: string;
          created_at: string;
          decision_reason: string | null;
          employee_id: string;
          event_id: string | null;
          event_type: string;
          id: string;
          level_1_at: string | null;
          original_value: Json;
          reason: string;
          replacement_value: Json;
          shift_id: string;
          status: string;
          submission_id: string | null;
          two_level: boolean;
        };
        Insert: {
          actor: string;
          approved_at?: string | null;
          approved_by_level_1?: string | null;
          approved_by_level_2?: string | null;
          company_id: string;
          created_at?: string;
          decision_reason?: string | null;
          employee_id: string;
          event_id?: string | null;
          event_type: string;
          id?: string;
          level_1_at?: string | null;
          original_value: Json;
          reason: string;
          replacement_value: Json;
          shift_id: string;
          status?: string;
          submission_id?: string | null;
          two_level: boolean;
        };
        Update: {
          actor?: string;
          approved_at?: string | null;
          approved_by_level_1?: string | null;
          approved_by_level_2?: string | null;
          company_id?: string;
          created_at?: string;
          decision_reason?: string | null;
          employee_id?: string;
          event_id?: string | null;
          event_type?: string;
          id?: string;
          level_1_at?: string | null;
          original_value?: Json;
          reason?: string;
          replacement_value?: Json;
          shift_id?: string;
          status?: string;
          submission_id?: string | null;
          two_level?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "sl_corrections_actor_fkey";
            columns: ["actor"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_actor_tenant_fk";
            columns: ["actor", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_approved_by_level_1_fkey";
            columns: ["approved_by_level_1"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_approved_by_level_1_tenant_fk";
            columns: ["approved_by_level_1", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_approved_by_level_2_fkey";
            columns: ["approved_by_level_2"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_approved_by_level_2_tenant_fk";
            columns: ["approved_by_level_2", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_event_id_tenant_fk";
            columns: ["event_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_event_shift_fk";
            columns: ["event_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: true;
            referencedRelation: "sl_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_corrections_submission_id_tenant_fk";
            columns: ["submission_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_submissions";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_corrections_submission_owner_fk";
            columns: ["submission_id", "shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_submissions";
            referencedColumns: ["id", "shift_id", "employee_id", "company_id"];
          },
        ];
      };
      sl_devices: {
        Row: {
          client_type: string;
          company_id: string;
          created_at: string;
          employee_id: string;
          id: string;
          platform: string;
          revoked: boolean;
        };
        Insert: {
          client_type: string;
          company_id: string;
          created_at?: string;
          employee_id: string;
          id: string;
          platform: string;
          revoked?: boolean;
        };
        Update: {
          client_type?: string;
          company_id?: string;
          created_at?: string;
          employee_id?: string;
          id?: string;
          platform?: string;
          revoked?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "sl_devices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_devices_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_devices_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_employees: {
        Row: {
          access_role: string;
          access_status: string;
          activation_expires: string | null;
          activation_hash: string | null;
          bio: string;
          company_id: string;
          email: string;
          id: string;
          job_title: string;
          login_method: string;
          name: string;
          no: string;
          payroll_admin: boolean;
          phone: string;
          photo_url: string;
          photo_path: string | null;
          role: string;
          site_id: string;
          team: string;
          user_id: string | null;
        };
        Insert: {
          access_role?: string;
          access_status?: string;
          activation_expires?: string | null;
          activation_hash?: string | null;
          bio?: string;
          company_id: string;
          email?: string;
          id?: string;
          job_title?: string;
          login_method?: string;
          name: string;
          no: string;
          payroll_admin?: boolean;
          phone?: string;
          photo_url?: string;
          photo_path?: string | null;
          role: string;
          site_id: string;
          team?: string;
          user_id?: string | null;
        };
        Update: {
          access_role?: string;
          access_status?: string;
          activation_expires?: string | null;
          activation_hash?: string | null;
          bio?: string;
          company_id?: string;
          email?: string;
          id?: string;
          job_title?: string;
          login_method?: string;
          name?: string;
          no?: string;
          payroll_admin?: boolean;
          phone?: string;
          photo_url?: string;
          photo_path?: string | null;
          role?: string;
          site_id?: string;
          team?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sl_employees_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_employees_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sl_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_employees_site_id_tenant_fk";
            columns: ["site_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_sites";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_events: {
        Row: {
          captured_at: string;
          company_id: string;
          employee_id: string;
          id: string;
          job_id: string | null;
          note: string;
          received_at: string;
          seq: number;
          shift_id: string;
          type: string;
        };
        Insert: {
          captured_at?: string;
          company_id: string;
          employee_id: string;
          id: string;
          job_id?: string | null;
          note?: string;
          received_at?: string;
          seq?: never;
          shift_id: string;
          type: string;
        };
        Update: {
          captured_at?: string;
          company_id?: string;
          employee_id?: string;
          id?: string;
          job_id?: string | null;
          note?: string;
          received_at?: string;
          seq?: never;
          shift_id?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_events_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_events_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_events_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_events_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_events_job_id_tenant_fk";
            columns: ["job_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_events_job_shift_fk";
            columns: ["job_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_events_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_events_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_events_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_gross_runs: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          id: string;
          period_id: string;
          rows: Json;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          id?: string;
          period_id: string;
          rows: Json;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          period_id?: string;
          rows?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "sl_gross_runs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_gross_runs_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_gross_runs_created_by_tenant_fk";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_gross_runs_period_id_fkey";
            columns: ["period_id"];
            isOneToOne: true;
            referencedRelation: "sl_periods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_gross_runs_period_id_tenant_fk";
            columns: ["period_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_periods";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_incident_targets: {
        Row: {
          company_id: string;
          employee_id: string;
          incident_id: string;
        };
        Insert: {
          company_id: string;
          employee_id: string;
          incident_id: string;
        };
        Update: {
          company_id?: string;
          employee_id?: string;
          incident_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_incident_targets_employee_id_company_id_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_incident_targets_incident_id_company_id_fkey";
            columns: ["incident_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_incidents";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_incidents: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          description: string;
          ends_at: string;
          id: string;
          kind: string;
          source_payload: Json;
          starts_at: string;
          title: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          description: string;
          ends_at: string;
          id: string;
          kind: string;
          source_payload: Json;
          starts_at: string;
          title: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          description?: string;
          ends_at?: string;
          id?: string;
          kind?: string;
          source_payload?: Json;
          starts_at?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_incidents_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_incidents_created_by_company_id_fkey";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_job_comments: {
        Row: {
          author_id: string;
          body: string;
          company_id: string;
          created_at: string;
          id: string;
          job_id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          company_id: string;
          created_at?: string;
          id?: string;
          job_id: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_job_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_comments_author_id_tenant_fk";
            columns: ["author_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_job_comments_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_comments_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_comments_job_id_tenant_fk";
            columns: ["job_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_job_members: {
        Row: {
          added_at: string;
          added_by: string;
          company_id: string;
          employee_id: string;
          job_id: string;
        };
        Insert: {
          added_at?: string;
          added_by: string;
          company_id: string;
          employee_id: string;
          job_id: string;
        };
        Update: {
          added_at?: string;
          added_by?: string;
          company_id?: string;
          employee_id?: string;
          job_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_job_members_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_members_added_by_tenant_fk";
            columns: ["added_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_job_members_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_members_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_members_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_job_members_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_members_job_id_tenant_fk";
            columns: ["job_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_job_steps: {
        Row: {
          company_id: string;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          job_id: string;
          label: string;
          sort_order: number;
        };
        Insert: {
          company_id: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by: string;
          id?: string;
          job_id: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          company_id?: string;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          job_id?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_job_steps_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_steps_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_steps_completed_by_tenant_fk";
            columns: ["completed_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_job_steps_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_steps_created_by_tenant_fk";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_job_steps_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_job_steps_job_id_tenant_fk";
            columns: ["job_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_jobs: {
        Row: {
          calendar_job_id: string | null;
          company_id: string;
          destination: string;
          employee_id: string;
          end_time: string;
          id: string;
          instructions: string;
          latitude: number | null;
          longitude: number | null;
          lunch_option: string;
          overtime: boolean;
          radius_m: number;
          shift_id: string;
          start_time: string;
          status: string;
          supervisor: string;
          title: string;
        };
        Insert: {
          calendar_job_id?: string | null;
          company_id: string;
          destination: string;
          employee_id: string;
          end_time: string;
          id?: string;
          instructions?: string;
          latitude?: number | null;
          longitude?: number | null;
          lunch_option?: string;
          overtime?: boolean;
          radius_m?: number;
          shift_id: string;
          start_time: string;
          status?: string;
          supervisor: string;
          title: string;
        };
        Update: {
          calendar_job_id?: string | null;
          company_id?: string;
          destination?: string;
          employee_id?: string;
          end_time?: string;
          id?: string;
          instructions?: string;
          latitude?: number | null;
          longitude?: number | null;
          lunch_option?: string;
          overtime?: boolean;
          radius_m?: number;
          shift_id?: string;
          start_time?: string;
          status?: string;
          supervisor?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_job_plan_company";
            columns: ["calendar_job_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_calendar_jobs";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_jobs_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_jobs_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_jobs_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_jobs_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_jobs_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_jobs_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_kiosk_codes: {
        Row: {
          code_hash: string;
          company_id: string;
          employee_id: string;
          expires_at: string;
          failed_attempts: number;
          issued_at: string;
          issued_by: string;
          locked_until: string | null;
          revoked: boolean;
        };
        Insert: {
          code_hash: string;
          company_id: string;
          employee_id: string;
          expires_at: string;
          failed_attempts?: number;
          issued_at?: string;
          issued_by: string;
          locked_until?: string | null;
          revoked?: boolean;
        };
        Update: {
          code_hash?: string;
          company_id?: string;
          employee_id?: string;
          expires_at?: string;
          failed_attempts?: number;
          issued_at?: string;
          issued_by?: string;
          locked_until?: string | null;
          revoked?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "sl_kiosk_codes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_kiosk_codes_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: true;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_kiosk_codes_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_kiosk_codes_issued_by_fkey";
            columns: ["issued_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_kiosk_codes_issued_by_tenant_fk";
            columns: ["issued_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_manager_notes: {
        Row: {
          author_id: string;
          body: string;
          company_id: string;
          created_at: string;
          id: string;
          title: string;
        };
        Insert: {
          author_id: string;
          body?: string;
          company_id: string;
          created_at?: string;
          id?: string;
          title: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          company_id?: string;
          created_at?: string;
          id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_manager_notes_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_manager_notes_author_id_tenant_fk";
            columns: ["author_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_manager_notes_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_manager_notification_reads: {
        Row: {
          employee_id: string;
          notification_id: string;
          read_at: string;
        };
        Insert: {
          employee_id: string;
          notification_id: string;
          read_at?: string;
        };
        Update: {
          employee_id?: string;
          notification_id?: string;
          read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_manager_notification_reads_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_messages: {
        Row: {
          body: string;
          company_id: string;
          id: string;
          read_at: string | null;
          recipient_id: string;
          sender_id: string;
          sent_at: string;
          thread_id: string | null;
          title: string;
        };
        Insert: {
          body: string;
          company_id: string;
          id?: string;
          read_at?: string | null;
          recipient_id: string;
          sender_id: string;
          sent_at?: string;
          thread_id?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          company_id?: string;
          id?: string;
          read_at?: string | null;
          recipient_id?: string;
          sender_id?: string;
          sent_at?: string;
          thread_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_messages_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_messages_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_messages_recipient_id_tenant_fk";
            columns: ["recipient_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_messages_sender_id_tenant_fk";
            columns: ["sender_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_messages_thread_id_fkey";
            columns: ["thread_id"];
            isOneToOne: false;
            referencedRelation: "sl_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_messages_thread_id_tenant_fk";
            columns: ["thread_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_messages";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_notice_acks: {
        Row: {
          acknowledged_at: string;
          employee_id: string;
          notice_id: string;
        };
        Insert: {
          acknowledged_at?: string;
          employee_id: string;
          notice_id: string;
        };
        Update: {
          acknowledged_at?: string;
          employee_id?: string;
          notice_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_notice_acks_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_notice_acks_notice_id_fkey";
            columns: ["notice_id"];
            isOneToOne: false;
            referencedRelation: "sl_notices";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_notices: {
        Row: {
          body: string;
          company_id: string;
          created_at: string;
          created_by: string;
          ends_on: string;
          id: string;
          kind: string;
          requires_ack: boolean;
          starts_on: string;
          starts_time: string | null;
          title: string;
        };
        Insert: {
          body?: string;
          company_id: string;
          created_at?: string;
          created_by: string;
          ends_on: string;
          id?: string;
          kind: string;
          requires_ack?: boolean;
          starts_on: string;
          starts_time?: string | null;
          title: string;
        };
        Update: {
          body?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string;
          ends_on?: string;
          id?: string;
          kind?: string;
          requires_ack?: boolean;
          starts_on?: string;
          starts_time?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_notices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_notices_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_notices_created_by_tenant_fk";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_notifications: {
        Row: {
          company_id: string;
          created_at: string;
          destination: string;
          employee_id: string;
          id: string;
          read_at: string | null;
          source: string;
          title: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          destination: string;
          employee_id: string;
          id?: string;
          read_at?: string | null;
          source: string;
          title: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          destination?: string;
          employee_id?: string;
          id?: string;
          read_at?: string | null;
          source?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_notifications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_notifications_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_pay_rates: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string;
          currency: string;
          effective_on: string;
          employee_id: string;
          hourly_minor: number;
          id: string;
          overtime_multiplier_bp: number;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by: string;
          currency: string;
          effective_on: string;
          employee_id: string;
          hourly_minor: number;
          id?: string;
          overtime_multiplier_bp: number;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string;
          currency?: string;
          effective_on?: string;
          employee_id?: string;
          hourly_minor?: number;
          id?: string;
          overtime_multiplier_bp?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_pay_rates_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_pay_rates_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_pay_rates_created_by_tenant_fk";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_pay_rates_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_pay_rates_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_periods: {
        Row: {
          company_id: string;
          end_date: string;
          id: string;
          locked_at: string;
          locked_by: string;
          rows: Json;
          start_date: string;
        };
        Insert: {
          company_id: string;
          end_date: string;
          id?: string;
          locked_at?: string;
          locked_by: string;
          rows: Json;
          start_date: string;
        };
        Update: {
          company_id?: string;
          end_date?: string;
          id?: string;
          locked_at?: string;
          locked_by?: string;
          rows?: Json;
          start_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_periods_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_periods_locked_by_fkey";
            columns: ["locked_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_periods_locked_by_tenant_fk";
            columns: ["locked_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_policies: {
        Row: {
          allow_offline_clockin: boolean;
          company_id: string;
          created_at: string;
          created_by: string | null;
          enforce_geofence: boolean;
          lunch_paid: boolean;
          require_approval_for_departure: boolean;
          require_face_match: boolean;
          require_gps_stamp: boolean;
          require_two_level_correction_approval: boolean;
          version: number;
        };
        Insert: {
          allow_offline_clockin?: boolean;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          enforce_geofence?: boolean;
          lunch_paid?: boolean;
          require_approval_for_departure?: boolean;
          require_face_match?: boolean;
          require_gps_stamp?: boolean;
          require_two_level_correction_approval?: boolean;
          version: number;
        };
        Update: {
          allow_offline_clockin?: boolean;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          enforce_geofence?: boolean;
          lunch_paid?: boolean;
          require_approval_for_departure?: boolean;
          require_face_match?: boolean;
          require_gps_stamp?: boolean;
          require_two_level_correction_approval?: boolean;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_policies_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_policies_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_policies_created_by_tenant_fk";
            columns: ["created_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_report_documents: {
        Row: {
          company_id: string;
          created_at: string;
          filename: string;
          id: string;
          incident_id: string;
          mime_type: string;
          object_path: string;
          size_bytes: number;
          status: string;
          uploaded_by: string;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          filename: string;
          id: string;
          incident_id: string;
          mime_type: string;
          object_path: string;
          size_bytes: number;
          status?: string;
          uploaded_by: string;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          filename?: string;
          id?: string;
          incident_id?: string;
          mime_type?: string;
          object_path?: string;
          size_bytes?: number;
          status?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_report_documents_incident_id_company_id_fkey";
            columns: ["incident_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_incidents";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_report_documents_uploaded_by_company_id_fkey";
            columns: ["uploaded_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_request_decision_reads: {
        Row: {
          employee_id: string;
          read_at: string;
          request_id: string;
        };
        Insert: {
          employee_id: string;
          read_at?: string;
          request_id: string;
        };
        Update: {
          employee_id?: string;
          read_at?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_request_decision_reads_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_request_decision_reads_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: true;
            referencedRelation: "sl_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_leave_settings: {
        Row: {
          company_id: string;
          minutes_per_day: number;
          revision: number;
          working_days: number[];
        };
        Insert: {
          company_id: string;
          minutes_per_day: number;
          revision?: number;
          working_days: number[];
        };
        Update: {
          company_id?: string;
          minutes_per_day?: number;
          revision?: number;
          working_days?: number[];
        };
        Relationships: [
          {
            foreignKeyName: "sl_leave_settings_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: true;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_leave_allowances: {
        Row: {
          company_id: string;
          employee_id: string;
          leave_type: string;
          minutes: number;
          year: number;
        };
        Insert: {
          company_id: string;
          employee_id: string;
          leave_type: string;
          minutes: number;
          year: number;
        };
        Update: {
          company_id?: string;
          employee_id?: string;
          leave_type?: string;
          minutes?: number;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_leave_allowances_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_leave_allowances_employee_id_company_id_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_leave_allowances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_leave_charges: {
        Row: {
          calculation: Json;
          company_id: string;
          employee_id: string;
          leave_type: string;
          minutes: number;
          request_id: string;
          year: number;
        };
        Insert: {
          calculation: Json;
          company_id: string;
          employee_id: string;
          leave_type: string;
          minutes: number;
          request_id: string;
          year: number;
        };
        Update: {
          calculation?: Json;
          company_id?: string;
          employee_id?: string;
          leave_type?: string;
          minutes?: number;
          request_id?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_leave_charges_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_leave_charges_employee_id_company_id_fkey";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_leave_charges_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_leave_charges_request_id_company_id_fkey";
            columns: ["request_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_requests";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_leave_charges_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "sl_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_requests: {
        Row: {
          leave_type: string | null;
          approval_required: boolean;
          company_id: string;
          detail: string;
          employee_id: string;
          expected_return: string | null;
          id: string;
          kind: string;
          leave_end: string | null;
          leave_end_time: string | null;
          leave_start: string | null;
          leave_start_time: string | null;
          reason: string | null;
          reviewer: string | null;
          status: string;
          submitted_at: string;
          summary: string;
        };
        Insert: {
          leave_type?: string | null;
          approval_required?: boolean;
          company_id: string;
          detail?: string;
          employee_id: string;
          expected_return?: string | null;
          id?: string;
          kind: string;
          leave_end?: string | null;
          leave_end_time?: string | null;
          leave_start?: string | null;
          leave_start_time?: string | null;
          reason?: string | null;
          reviewer?: string | null;
          status?: string;
          submitted_at?: string;
          summary: string;
        };
        Update: {
          leave_type?: string | null;
          approval_required?: boolean;
          company_id?: string;
          detail?: string;
          employee_id?: string;
          expected_return?: string | null;
          id?: string;
          kind?: string;
          leave_end?: string | null;
          leave_end_time?: string | null;
          leave_start?: string | null;
          leave_start_time?: string | null;
          reason?: string | null;
          reviewer?: string | null;
          status?: string;
          submitted_at?: string;
          summary?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_requests_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_requests_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_setup_progress: {
        Row: {
          company_id: string;
          completed_at: string;
          completed_by: string;
          evidence: string;
          step: string;
        };
        Insert: {
          company_id: string;
          completed_at?: string;
          completed_by: string;
          evidence: string;
          step: string;
        };
        Update: {
          company_id?: string;
          completed_at?: string;
          completed_by?: string;
          evidence?: string;
          step?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_setup_progress_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_setup_progress_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_setup_progress_completed_by_tenant_fk";
            columns: ["completed_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_shifts: {
        Row: {
          finish_date: string;
          company_id: string;
          date: string;
          employee_id: string;
          end_time: string;
          id: string;
          lunch_minutes: number;
          lunch_time: string;
          policy_version: number;
          regular_minutes: number;
          site_id: string;
          start_time: string;
        };
        Insert: {
          finish_date?: string;
          company_id: string;
          date: string;
          employee_id: string;
          end_time: string;
          id?: string;
          lunch_minutes: number;
          lunch_time: string;
          policy_version?: number;
          regular_minutes?: number;
          site_id: string;
          start_time: string;
        };
        Update: {
          finish_date?: string;
          company_id?: string;
          date?: string;
          employee_id?: string;
          end_time?: string;
          id?: string;
          lunch_minutes?: number;
          lunch_time?: string;
          policy_version?: number;
          regular_minutes?: number;
          site_id?: string;
          start_time?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_shift_policy";
            columns: ["company_id", "policy_version"];
            isOneToOne: false;
            referencedRelation: "sl_policies";
            referencedColumns: ["company_id", "version"];
          },
          {
            foreignKeyName: "sl_shifts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_shifts_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_shifts_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_shifts_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sl_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_shifts_site_id_tenant_fk";
            columns: ["site_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_sites";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_site_alerts: {
        Row: {
          accuracy_m: number;
          company_id: string;
          distance_m: number;
          employee_id: string;
          id: string;
          job_id: string | null;
          kind: string;
          observed_at: string;
          shift_id: string;
          source: string;
        };
        Insert: {
          accuracy_m: number;
          company_id: string;
          distance_m: number;
          employee_id: string;
          id?: string;
          job_id?: string | null;
          kind: string;
          observed_at?: string;
          shift_id: string;
          source: string;
        };
        Update: {
          accuracy_m?: number;
          company_id?: string;
          distance_m?: number;
          employee_id?: string;
          id?: string;
          job_id?: string | null;
          kind?: string;
          observed_at?: string;
          shift_id?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_alert_job_shift_fk";
            columns: ["job_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_alerts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_alerts_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_alerts_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_alerts_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_alerts_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_alerts_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_site_presence: {
        Row: {
          accuracy_m: number | null;
          checked_at: string;
          company_id: string;
          employee_id: string;
          inside: boolean;
          job_id: string | null;
          latitude: number | null;
          longitude: number | null;
          shift_id: string;
          site_id: string;
        };
        Insert: {
          accuracy_m?: number | null;
          checked_at?: string;
          company_id: string;
          employee_id: string;
          inside: boolean;
          job_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          shift_id: string;
          site_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          checked_at?: string;
          company_id?: string;
          employee_id?: string;
          inside?: boolean;
          job_id?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          shift_id?: string;
          site_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_presence_job_shift_fk";
            columns: ["job_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_presence_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_presence_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: true;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_presence_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_presence_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_presence_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_presence_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
          {
            foreignKeyName: "sl_site_presence_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sl_sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_site_presence_site_id_tenant_fk";
            columns: ["site_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_sites";
            referencedColumns: ["id", "company_id"];
          },
        ];
      };
      sl_sites: {
        Row: {
          address: string;
          company_id: string;
          geofence_mode: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          max_accuracy_m: number;
          name: string;
          radius_m: number;
        };
        Insert: {
          address?: string;
          company_id: string;
          geofence_mode?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          max_accuracy_m?: number;
          name: string;
          radius_m?: number;
        };
        Update: {
          address?: string;
          company_id?: string;
          geofence_mode?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          max_accuracy_m?: number;
          name?: string;
          radius_m?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sl_sites_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
        ];
      };
      sl_submissions: {
        Row: {
          canonical_event_id: string | null;
          captured_at: string;
          company_id: string;
          device_id: string | null;
          employee_id: string;
          id: string;
          payload: Json;
          reason: string | null;
          received_at: string;
          shift_id: string;
          status: string;
          warning: string | null;
        };
        Insert: {
          canonical_event_id?: string | null;
          captured_at: string;
          company_id: string;
          device_id?: string | null;
          employee_id: string;
          id: string;
          payload: Json;
          reason?: string | null;
          received_at?: string;
          shift_id: string;
          status: string;
          warning?: string | null;
        };
        Update: {
          canonical_event_id?: string | null;
          captured_at?: string;
          company_id?: string;
          device_id?: string | null;
          employee_id?: string;
          id?: string;
          payload?: Json;
          reason?: string | null;
          received_at?: string;
          shift_id?: string;
          status?: string;
          warning?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sl_submissions_canonical_event_id_fkey";
            columns: ["canonical_event_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_submissions_canonical_event_id_tenant_fk";
            columns: ["canonical_event_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_submissions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_submissions_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "sl_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_submissions_device_id_tenant_fk";
            columns: ["device_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_devices";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_submissions_device_owner_fk";
            columns: ["device_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_devices";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
          {
            foreignKeyName: "sl_submissions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_submissions_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_submissions_event_shift_fk";
            columns: ["canonical_event_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_events";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_submissions_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_submissions_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_submissions_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_timesheets: {
        Row: {
          calculation_id: string | null;
          company_id: string;
          employee_id: string;
          overtime_approved: number;
          overtime_requested: number;
          reviewed_at: string | null;
          reviewed_by: string | null;
          shift_id: string;
          status: string;
        };
        Insert: {
          calculation_id?: string | null;
          company_id: string;
          employee_id: string;
          overtime_approved?: number;
          overtime_requested?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          shift_id: string;
          status?: string;
        };
        Update: {
          calculation_id?: string | null;
          company_id?: string;
          employee_id?: string;
          overtime_approved?: number;
          overtime_requested?: number;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          shift_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_timesheets_calculation_id_fkey";
            columns: ["calculation_id"];
            isOneToOne: false;
            referencedRelation: "sl_calculations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_timesheets_calculation_id_tenant_fk";
            columns: ["calculation_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_calculations";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_timesheets_calculation_shift_fk";
            columns: ["calculation_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_calculations";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_timesheets_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_timesheets_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_timesheets_employee_id_tenant_fk";
            columns: ["employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_timesheets_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_timesheets_reviewed_by_tenant_fk";
            columns: ["reviewed_by", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_employees";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_timesheets_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: true;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_timesheets_shift_id_tenant_fk";
            columns: ["shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "company_id"];
          },
          {
            foreignKeyName: "sl_timesheets_shift_owner_fk";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
      sl_work_activities: {
        Row: {
          company_id: string;
          description: string;
          employee_id: string;
          id: string;
          job_id: string | null;
          kind: string;
          recorded_at: string;
          shift_id: string;
        };
        Insert: {
          company_id: string;
          description: string;
          employee_id: string;
          id: string;
          job_id?: string | null;
          kind: string;
          recorded_at?: string;
          shift_id: string;
        };
        Update: {
          company_id?: string;
          description?: string;
          employee_id?: string;
          id?: string;
          job_id?: string | null;
          kind?: string;
          recorded_at?: string;
          shift_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sl_work_activities_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "sl_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sl_work_activities_job_id_shift_id_company_id_fkey";
            columns: ["job_id", "shift_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_jobs";
            referencedColumns: ["id", "shift_id", "company_id"];
          },
          {
            foreignKeyName: "sl_work_activities_shift_id_employee_id_company_id_fkey";
            columns: ["shift_id", "employee_id", "company_id"];
            isOneToOne: false;
            referencedRelation: "sl_shifts";
            referencedColumns: ["id", "employee_id", "company_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      sl_profile_change_requests: { Args: { p_action: string; p_data?: Json }; Returns: Json };
      sl_knowledge: { Args: { p_action: string; p_data?: Json }; Returns: Json };
      sl_availability: { Args: { p_action: string; p_data?: Json }; Returns: Json };
      sl_task_templates: { Args: { action: string; payload?: Json }; Returns: Json };
      sl_job_acknowledgements: { Args: { action: string; payload?: Json }; Returns: Json };
      sl_leave_changes: { Args: { p_action: string; p_data?: Json }; Returns: Json };
      sl_attendance_context: { Args: { action: string; payload?: Json }; Returns: Json };
      sl_punctuality: { Args: { action: string; payload?: Json }; Returns: Json };
      sl_report_interpretation: { Args: { p_incident: string }; Returns: Json };
      sl_command: { Args: { p_action: string; p_data: Json }; Returns: Json };
      sl_notifications_api: {
        Args: { action: string; payload?: Json };
        Returns: Json;
      };
      sl_push_batch: { Args: never; Returns: Json };
      sl_push_configuration: {
        Args: { private_key?: string; public_key?: string };
        Returns: Json;
      };
      sl_push_result: {
        Args: { delivery: string; outcome: string; token: string };
        Returns: undefined;
      };
      sl_snapshot: { Args: never; Returns: Json };
      sl_worker_access_target: {
        Args: { p_employee_id: string };
        Returns: Json;
      };
      sl_worker_code_replaced: {
        Args: { p_employee_id: string; p_manager_user_id: string };
        Returns: undefined;
      };
      sl_worker_register: {
        Args: {
          p_company_id: string;
          p_no: string;
          p_profile: Json;
          p_user_id: string;
        };
        Returns: Json;
      };
      sl_worker_signup_start: {
        Args:
          | { p_ip_hash: string; p_phone_hash: string }
          | { p_ip_hash: string; p_phone_hash: string; p_company_code: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
