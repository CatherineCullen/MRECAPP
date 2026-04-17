export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      barn_calendar_day: {
        Row: {
          barn_closed: boolean
          created_at: string
          date: string
          id: string
          is_makeup_day: boolean
          notes: string | null
          quarter_id: string | null
          updated_at: string
        }
        Insert: {
          barn_closed?: boolean
          created_at?: string
          date: string
          id?: string
          is_makeup_day?: boolean
          notes?: string | null
          quarter_id?: string | null
          updated_at?: string
        }
        Update: {
          barn_closed?: boolean
          created_at?: string
          date?: string
          id?: string
          is_makeup_day?: boolean
          notes?: string | null
          quarter_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "barn_calendar_day_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarter"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_line_item: {
        Row: {
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          horse_id: string
          id: string
          is_admin_added: boolean
          is_credit: boolean
          quantity: number
          source_board_service_id: string | null
          source_board_service_log_id: string | null
          source_training_ride_id: string | null
          status: Database["public"]["Enums"]["billing_line_item_status"]
          total: number | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description: string
          horse_id: string
          id?: string
          is_admin_added?: boolean
          is_credit?: boolean
          quantity?: number
          source_board_service_id?: string | null
          source_board_service_log_id?: string | null
          source_training_ride_id?: string | null
          status?: Database["public"]["Enums"]["billing_line_item_status"]
          total?: number | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          horse_id?: string
          id?: string
          is_admin_added?: boolean
          is_credit?: boolean
          quantity?: number
          source_board_service_id?: string | null
          source_board_service_log_id?: string | null
          source_training_ride_id?: string | null
          status?: Database["public"]["Enums"]["billing_line_item_status"]
          total?: number | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_line_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_item_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_item_source_board_service_id_fkey"
            columns: ["source_board_service_id"]
            isOneToOne: false
            referencedRelation: "board_service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_item_source_board_service_log_id_fkey"
            columns: ["source_board_service_log_id"]
            isOneToOne: false
            referencedRelation: "board_service_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_item_source_training_ride_id_fkey"
            columns: ["source_training_ride_id"]
            isOneToOne: false
            referencedRelation: "training_ride"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_line_item_allocation: {
        Row: {
          amount: number
          billing_line_item_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          billing_line_item_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_line_item_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_line_item_allocation_billing_line_item_id_fkey"
            columns: ["billing_line_item_id"]
            isOneToOne: false
            referencedRelation: "billing_line_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_item_allocation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_line_item_allocation_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      board_service: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean
          is_billable: boolean
          is_recurring_monthly: boolean
          name: string
          name_es: string | null
          qr_code_url: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_billable?: boolean
          is_recurring_monthly?: boolean
          name: string
          name_es?: string | null
          qr_code_url?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_billable?: boolean
          is_recurring_monthly?: boolean
          name?: string
          name_es?: string | null
          qr_code_url?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_service_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      board_service_log: {
        Row: {
          created_at: string
          horse_event_id: string | null
          horse_id: string
          id: string
          invoice_line_item_id: string | null
          is_billable: boolean
          log_source: Database["public"]["Enums"]["log_source"]
          logged_at: string
          logged_by_id: string | null
          logged_by_label: string | null
          notes: string | null
          provider_qr_code_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_id: string
          status: Database["public"]["Enums"]["board_service_log_status"]
          unit_price: number | null
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          horse_event_id?: string | null
          horse_id: string
          id?: string
          invoice_line_item_id?: string | null
          is_billable: boolean
          log_source: Database["public"]["Enums"]["log_source"]
          logged_at: string
          logged_by_id?: string | null
          logged_by_label?: string | null
          notes?: string | null
          provider_qr_code_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["board_service_log_status"]
          unit_price?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          horse_event_id?: string | null
          horse_id?: string
          id?: string
          invoice_line_item_id?: string | null
          is_billable?: boolean
          log_source?: Database["public"]["Enums"]["log_source"]
          logged_at?: string
          logged_by_id?: string | null
          logged_by_label?: string | null
          notes?: string | null
          provider_qr_code_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["board_service_log_status"]
          unit_price?: number | null
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "board_service_log_horse_event_id_fkey"
            columns: ["horse_event_id"]
            isOneToOne: false
            referencedRelation: "horse_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_invoice_line_item_fk"
            columns: ["invoice_line_item_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_logged_by_id_fkey"
            columns: ["logged_by_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_provider_qr_code_id_fkey"
            columns: ["provider_qr_code_id"]
            isOneToOne: false
            referencedRelation: "provider_qr_code"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "board_service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_service_log_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      camp_enrollment: {
        Row: {
          camp_session_id: string
          compliance_docs_complete: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          participant_age: number | null
          participant_name: string
          purchased_by_person_id: string
          status: Database["public"]["Enums"]["camp_enrollment_status"]
          updated_at: string
        }
        Insert: {
          camp_session_id: string
          compliance_docs_complete?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          participant_age?: number | null
          participant_name: string
          purchased_by_person_id: string
          status?: Database["public"]["Enums"]["camp_enrollment_status"]
          updated_at?: string
        }
        Update: {
          camp_session_id?: string
          compliance_docs_complete?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          participant_age?: number | null
          participant_name?: string
          purchased_by_person_id?: string
          status?: Database["public"]["Enums"]["camp_enrollment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_enrollment_camp_session_id_fkey"
            columns: ["camp_session_id"]
            isOneToOne: false
            referencedRelation: "camp_session"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_enrollment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_enrollment_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_enrollment_purchased_by_person_id_fkey"
            columns: ["purchased_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      camp_session: {
        Row: {
          capacity: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          notes: string | null
          price_per_enrollee: number
          status: Database["public"]["Enums"]["camp_session_status"]
          updated_at: string
          week_start: string
        }
        Insert: {
          capacity: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          notes?: string | null
          price_per_enrollee: number
          status?: Database["public"]["Enums"]["camp_session_status"]
          updated_at?: string
          week_start: string
        }
        Update: {
          capacity?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          price_per_enrollee?: number
          status?: Database["public"]["Enums"]["camp_session_status"]
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_session_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plan: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_on: string | null
          horse_id: string
          id: string
          is_active: boolean
          previous_version_id: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_quote: string | null
          source_vet_visit_id: string | null
          starts_on: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on?: string | null
          horse_id: string
          id?: string
          is_active?: boolean
          previous_version_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_quote?: string | null
          source_vet_visit_id?: string | null
          starts_on?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on?: string | null
          horse_id?: string
          id?: string
          is_active?: boolean
          previous_version_id?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_quote?: string | null
          source_vet_visit_id?: string | null
          starts_on?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "care_plan_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plan_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plan_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "care_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plan_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_plan_source_vet_visit_fk"
            columns: ["source_vet_visit_id"]
            isOneToOne: false
            referencedRelation: "vet_visit"
            referencedColumns: ["id"]
          },
        ]
      }
      coggins: {
        Row: {
          created_at: string
          created_by: string | null
          date_drawn: string
          deleted_at: string | null
          document_id: string | null
          expiry_date: string | null
          form_serial_number: string | null
          horse_id: string
          id: string
          updated_at: string
          vet_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_drawn: string
          deleted_at?: string | null
          document_id?: string | null
          expiry_date?: string | null
          form_serial_number?: string | null
          horse_id: string
          id?: string
          updated_at?: string
          vet_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_drawn?: string
          deleted_at?: string | null
          document_id?: string | null
          expiry_date?: string | null
          form_serial_number?: string | null
          horse_id?: string
          id?: string
          updated_at?: string
          vet_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coggins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coggins_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coggins_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definition: {
        Row: {
          created_at: string
          created_by: string | null
          entity_type: Database["public"]["Enums"]["custom_field_entity_type"]
          field_name: string
          field_type: Database["public"]["Enums"]["custom_field_field_type"]
          id: string
          is_active: boolean
          section: Database["public"]["Enums"]["custom_field_section"] | null
          visibility_tier: Database["public"]["Enums"]["custom_field_visibility_tier"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity_type: Database["public"]["Enums"]["custom_field_entity_type"]
          field_name: string
          field_type: Database["public"]["Enums"]["custom_field_field_type"]
          id?: string
          is_active?: boolean
          section?: Database["public"]["Enums"]["custom_field_section"] | null
          visibility_tier?: Database["public"]["Enums"]["custom_field_visibility_tier"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity_type?: Database["public"]["Enums"]["custom_field_entity_type"]
          field_name?: string
          field_type?: Database["public"]["Enums"]["custom_field_field_type"]
          id?: string
          is_active?: boolean
          section?: Database["public"]["Enums"]["custom_field_section"] | null
          visibility_tier?: Database["public"]["Enums"]["custom_field_visibility_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definition_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      diet_record: {
        Row: {
          am_feed: string | null
          am_hay: string | null
          am_supplements: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          horse_id: string
          id: string
          notes: string | null
          pm_feed: string | null
          pm_hay: string | null
          pm_supplements: string | null
          updated_at: string
          version: number
        }
        Insert: {
          am_feed?: string | null
          am_hay?: string | null
          am_supplements?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          horse_id: string
          id?: string
          notes?: string | null
          pm_feed?: string | null
          pm_hay?: string | null
          pm_supplements?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          am_feed?: string | null
          am_hay?: string | null
          am_supplements?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          horse_id?: string
          id?: string
          notes?: string | null
          pm_feed?: string | null
          pm_hay?: string | null
          pm_supplements?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "diet_record_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diet_record_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
        ]
      }
      document: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_type: string
          expires_at: string | null
          file_url: string
          filename: string
          horse_id: string | null
          id: string
          notes: string | null
          person_id: string | null
          signed_at: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type: string
          expires_at?: string | null
          file_url: string
          filename: string
          horse_id?: string | null
          id?: string
          notes?: string | null
          person_id?: string | null
          signed_at?: string | null
          updated_at?: string
          uploaded_at: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_type?: string
          expires_at?: string | null
          file_url?: string
          filename?: string
          horse_id?: string | null
          id?: string
          notes?: string | null
          person_id?: string | null
          signed_at?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      event: {
        Row: {
          billing_skipped_at: string | null
          billing_skipped_reason: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes: number
          event_type_code: string
          host_id: string
          id: string
          instructor_id: string | null
          invoice_id: string | null
          notes: string | null
          party_size: number | null
          price: number
          scheduled_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          billing_skipped_at?: string | null
          billing_skipped_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes: number
          event_type_code: string
          host_id: string
          id?: string
          instructor_id?: string | null
          invoice_id?: string | null
          notes?: string | null
          party_size?: number | null
          price: number
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          billing_skipped_at?: string | null
          billing_skipped_reason?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number
          event_type_code?: string
          host_id?: string
          id?: string
          instructor_id?: string | null
          invoice_id?: string | null
          notes?: string | null
          party_size?: number | null
          price?: number
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_event_type_code_fkey"
            columns: ["event_type_code"]
            isOneToOne: false
            referencedRelation: "event_type"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "event_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
        ]
      }
      event_type: {
        Row: {
          calendar_badge: string | null
          calendar_color: string | null
          code: string
          created_at: string
          default_duration_minutes: number
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          calendar_badge?: string | null
          calendar_color?: string | null
          code: string
          created_at?: string
          default_duration_minutes: number
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          calendar_badge?: string | null
          calendar_color?: string | null
          code?: string
          created_at?: string
          default_duration_minutes?: number
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      health_event: {
        Row: {
          administered_by: string | null
          administered_by_person_id: string | null
          administered_on: string
          created_at: string
          deleted_at: string | null
          document_id: string | null
          health_item_type_id: string
          health_program_item_id: string | null
          horse_id: string
          id: string
          item_name: string | null
          lot_number: string | null
          next_due: string | null
          notes: string | null
          recorded_by: string | null
          result: string | null
          source_vet_visit_id: string | null
          updated_at: string
        }
        Insert: {
          administered_by?: string | null
          administered_by_person_id?: string | null
          administered_on: string
          created_at?: string
          deleted_at?: string | null
          document_id?: string | null
          health_item_type_id: string
          health_program_item_id?: string | null
          horse_id: string
          id?: string
          item_name?: string | null
          lot_number?: string | null
          next_due?: string | null
          notes?: string | null
          recorded_by?: string | null
          result?: string | null
          source_vet_visit_id?: string | null
          updated_at?: string
        }
        Update: {
          administered_by?: string | null
          administered_by_person_id?: string | null
          administered_on?: string
          created_at?: string
          deleted_at?: string | null
          document_id?: string | null
          health_item_type_id?: string
          health_program_item_id?: string | null
          horse_id?: string
          id?: string
          item_name?: string | null
          lot_number?: string | null
          next_due?: string | null
          notes?: string | null
          recorded_by?: string | null
          result?: string | null
          source_vet_visit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_event_administered_by_person_id_fkey"
            columns: ["administered_by_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_event_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_event_health_item_type_id_fkey"
            columns: ["health_item_type_id"]
            isOneToOne: false
            referencedRelation: "health_item_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_event_health_program_item_id_fkey"
            columns: ["health_program_item_id"]
            isOneToOne: false
            referencedRelation: "health_program_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_event_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_event_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_event_source_vet_visit_fk"
            columns: ["source_vet_visit_id"]
            isOneToOne: false
            referencedRelation: "vet_visit"
            referencedColumns: ["id"]
          },
        ]
      }
      health_item_type: {
        Row: {
          created_at: string
          created_by: string | null
          default_interval_days: number | null
          deleted_at: string | null
          id: string
          is_active: boolean
          is_essential: boolean
          name: string
          notes: string | null
          show_in_herd_dashboard: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_interval_days?: number | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_essential?: boolean
          name: string
          notes?: string | null
          show_in_herd_dashboard?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_interval_days?: number | null
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          is_essential?: boolean
          name?: string
          notes?: string | null
          show_in_herd_dashboard?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_item_type_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      health_program_item: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          health_item_type_id: string
          horse_id: string
          id: string
          interval_override_days: number | null
          last_done: string | null
          next_due: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          health_item_type_id: string
          horse_id: string
          id?: string
          interval_override_days?: number | null
          last_done?: string | null
          next_due?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          health_item_type_id?: string
          horse_id?: string
          id?: string
          interval_override_days?: number | null
          last_done?: string | null
          next_due?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "health_program_item_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_program_item_health_item_type_id_fkey"
            columns: ["health_item_type_id"]
            isOneToOne: false
            referencedRelation: "health_item_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_program_item_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
        ]
      }
      health_record: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          horse_id: string
          id: string
          notes: string | null
          record_type: string
          recorded_at: string
          recorded_by: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          horse_id: string
          id?: string
          notes?: string | null
          record_type: string
          recorded_at: string
          recorded_by?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          horse_id?: string
          id?: string
          notes?: string | null
          record_type?: string
          recorded_at?: string
          recorded_by?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "health_record_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_record_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "health_record_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      horse: {
        Row: {
          barn_name: string
          breed: string | null
          color: string | null
          created_at: string
          custom_fields: Json | null
          date_of_birth: string | null
          deleted_at: string | null
          gender: string | null
          height: number | null
          id: string
          lesson_horse: boolean
          microchip: string | null
          notes: string | null
          ownership_notes: string | null
          registered_name: string | null
          solo_turnout: boolean
          status: Database["public"]["Enums"]["horse_status"]
          status_changed_at: string | null
          status_reason: string | null
          turnout_notes: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          barn_name: string
          breed?: string | null
          color?: string | null
          created_at?: string
          custom_fields?: Json | null
          date_of_birth?: string | null
          deleted_at?: string | null
          gender?: string | null
          height?: number | null
          id?: string
          lesson_horse?: boolean
          microchip?: string | null
          notes?: string | null
          ownership_notes?: string | null
          registered_name?: string | null
          solo_turnout?: boolean
          status?: Database["public"]["Enums"]["horse_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          turnout_notes?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          barn_name?: string
          breed?: string | null
          color?: string | null
          created_at?: string
          custom_fields?: Json | null
          date_of_birth?: string | null
          deleted_at?: string | null
          gender?: string | null
          height?: number | null
          id?: string
          lesson_horse?: boolean
          microchip?: string | null
          notes?: string | null
          ownership_notes?: string | null
          registered_name?: string | null
          solo_turnout?: boolean
          status?: Database["public"]["Enums"]["horse_status"]
          status_changed_at?: string | null
          status_reason?: string | null
          turnout_notes?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      horse_contact: {
        Row: {
          can_log_in: boolean
          can_log_services: boolean
          created_at: string
          deleted_at: string | null
          horse_id: string
          id: string
          is_billing_contact: boolean
          person_id: string
          receives_health_alerts: boolean
          receives_lesson_notifications: boolean
          role: string | null
          updated_at: string
        }
        Insert: {
          can_log_in?: boolean
          can_log_services?: boolean
          created_at?: string
          deleted_at?: string | null
          horse_id: string
          id?: string
          is_billing_contact?: boolean
          person_id: string
          receives_health_alerts?: boolean
          receives_lesson_notifications?: boolean
          role?: string | null
          updated_at?: string
        }
        Update: {
          can_log_in?: boolean
          can_log_services?: boolean
          created_at?: string
          deleted_at?: string | null
          horse_id?: string
          id?: string
          is_billing_contact?: boolean
          person_id?: string
          receives_health_alerts?: boolean
          receives_lesson_notifications?: boolean
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horse_contact_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_contact_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      horse_event: {
        Row: {
          board_service_id: string | null
          created_at: string
          deleted_at: string | null
          event_type: Database["public"]["Enums"]["horse_event_type"]
          horse_id: string
          id: string
          lesson_id: string | null
          notes: string | null
          recorded_at: string | null
          recorded_by: string | null
          scheduled_at: string | null
          source_plan_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          board_service_id?: string | null
          created_at?: string
          deleted_at?: string | null
          event_type: Database["public"]["Enums"]["horse_event_type"]
          horse_id: string
          id?: string
          lesson_id?: string | null
          notes?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          scheduled_at?: string | null
          source_plan_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          board_service_id?: string | null
          created_at?: string
          deleted_at?: string | null
          event_type?: Database["public"]["Enums"]["horse_event_type"]
          horse_id?: string
          id?: string
          lesson_id?: string | null
          notes?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          scheduled_at?: string | null
          source_plan_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horse_event_board_service_id_fkey"
            columns: ["board_service_id"]
            isOneToOne: false
            referencedRelation: "board_service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_event_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_event_lesson_fk"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_event_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_event_source_plan_id_fkey"
            columns: ["source_plan_id"]
            isOneToOne: false
            referencedRelation: "care_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      horse_recording_ids: {
        Row: {
          additional_ids: Json | null
          breed_recording_number: string | null
          created_at: string
          deleted_at: string | null
          horse_id: string
          id: string
          passport_number: string | null
          updated_at: string
          usef_id: string | null
        }
        Insert: {
          additional_ids?: Json | null
          breed_recording_number?: string | null
          created_at?: string
          deleted_at?: string | null
          horse_id: string
          id?: string
          passport_number?: string | null
          updated_at?: string
          usef_id?: string | null
        }
        Update: {
          additional_ids?: Json | null
          breed_recording_number?: string | null
          created_at?: string
          deleted_at?: string | null
          horse_id?: string
          id?: string
          passport_number?: string | null
          updated_at?: string
          usef_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "horse_recording_ids_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: true
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
        ]
      }
      horse_scheduling_note: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_on: string | null
          horse_id: string
          id: string
          note: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on?: string | null
          horse_id: string
          id?: string
          note: string
          starts_on?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_on?: string | null
          horse_id?: string
          id?: string
          note?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horse_scheduling_note_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_scheduling_note_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horse_scheduling_note_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
        ]
      }
      import_prompt: {
        Row: {
          body: string
          created_at: string
          default_body: string
          description: string | null
          id: string
          label: string
          slug: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          default_body: string
          description?: string | null
          id?: string
          label: string
          slug: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          default_body?: string
          description?: string | null
          id?: string
          label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      instructor_availability: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          deleted_at: string | null
          effective_from: string
          effective_until: string | null
          end_time: string
          id: string
          notes: string | null
          person_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: Database["public"]["Enums"]["day_of_week"]
          deleted_at?: string | null
          effective_from: string
          effective_until?: string | null
          end_time: string
          id?: string
          notes?: string | null
          person_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: Database["public"]["Enums"]["day_of_week"]
          deleted_at?: string | null
          effective_from?: string
          effective_until?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          person_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instructor_availability_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_availability_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice: {
        Row: {
          billed_to_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          id: string
          notes: string | null
          paid_at: string | null
          paid_method: string | null
          period_end: string | null
          period_start: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id: string | null
          updated_at: string
        }
        Insert: {
          billed_to_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_method?: string | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Update: {
          billed_to_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_method?: string | null
          period_end?: string | null
          period_start?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_billed_to_id_fkey"
            columns: ["billed_to_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_item: {
        Row: {
          adjustment_for_id: string | null
          billing_line_item_allocation_id: string | null
          board_service_id: string | null
          board_service_log_id: string | null
          camp_enrollment_id: string | null
          created_at: string
          deleted_at: string | null
          description: string
          event_id: string | null
          horse_id: string | null
          id: string
          invoice_id: string
          is_admin_added: boolean
          is_credit: boolean
          lesson_package_id: string | null
          lesson_subscription_id: string | null
          line_item_type: Database["public"]["Enums"]["invoice_line_item_type"]
          quantity: number
          total: number | null
          training_ride_id: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          adjustment_for_id?: string | null
          billing_line_item_allocation_id?: string | null
          board_service_id?: string | null
          board_service_log_id?: string | null
          camp_enrollment_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description: string
          event_id?: string | null
          horse_id?: string | null
          id?: string
          invoice_id: string
          is_admin_added?: boolean
          is_credit?: boolean
          lesson_package_id?: string | null
          lesson_subscription_id?: string | null
          line_item_type?: Database["public"]["Enums"]["invoice_line_item_type"]
          quantity?: number
          total?: number | null
          training_ride_id?: string | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          adjustment_for_id?: string | null
          billing_line_item_allocation_id?: string | null
          board_service_id?: string | null
          board_service_log_id?: string | null
          camp_enrollment_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string
          event_id?: string | null
          horse_id?: string | null
          id?: string
          invoice_id?: string
          is_admin_added?: boolean
          is_credit?: boolean
          lesson_package_id?: string | null
          lesson_subscription_id?: string | null
          line_item_type?: Database["public"]["Enums"]["invoice_line_item_type"]
          quantity?: number
          total?: number | null
          training_ride_id?: string | null
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_item_adjustment_for_id_fkey"
            columns: ["adjustment_for_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_billing_allocation_fk"
            columns: ["billing_line_item_allocation_id"]
            isOneToOne: false
            referencedRelation: "billing_line_item_allocation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_board_service_id_fkey"
            columns: ["board_service_id"]
            isOneToOne: false
            referencedRelation: "board_service"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_board_service_log_id_fkey"
            columns: ["board_service_log_id"]
            isOneToOne: false
            referencedRelation: "board_service_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_camp_enrollment_id_fkey"
            columns: ["camp_enrollment_id"]
            isOneToOne: false
            referencedRelation: "camp_enrollment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_lesson_package_id_fkey"
            columns: ["lesson_package_id"]
            isOneToOne: false
            referencedRelation: "lesson_package"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_lesson_subscription_id_fkey"
            columns: ["lesson_subscription_id"]
            isOneToOne: false
            referencedRelation: "lesson_subscription"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_item_training_ride_id_fkey"
            columns: ["training_ride_id"]
            isOneToOne: false
            referencedRelation: "training_ride"
            referencedColumns: ["id"]
          },
        ]
      }
      lease: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          end_date: string | null
          horse_id: string
          id: string
          is_active: boolean
          lessee_id: string
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          end_date?: string | null
          horse_id: string
          id?: string
          is_active?: boolean
          lessee_id: string
          notes?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          end_date?: string | null
          horse_id?: string
          id?: string
          is_active?: boolean
          lessee_id?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_lessee_id_fkey"
            columns: ["lessee_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duration_minutes: number | null
          id: string
          instructor_id: string
          is_makeup: boolean
          lesson_type: Database["public"]["Enums"]["lesson_type"]
          makeup_for_lesson_id: string | null
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["lesson_status"]
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          instructor_id: string
          is_makeup?: boolean
          lesson_type: Database["public"]["Enums"]["lesson_type"]
          makeup_for_lesson_id?: string | null
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["lesson_status"]
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duration_minutes?: number | null
          id?: string
          instructor_id?: string
          is_makeup?: boolean
          lesson_type?: Database["public"]["Enums"]["lesson_type"]
          makeup_for_lesson_id?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["lesson_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_cancelled_by_id_fkey"
            columns: ["cancelled_by_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_makeup_for_lesson_id_fkey"
            columns: ["makeup_for_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_package: {
        Row: {
          billed_to_id: string
          billing_skipped_at: string | null
          billing_skipped_reason: string | null
          created_at: string
          created_by: string | null
          default_horse_id: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          package_price: number
          package_size: number
          person_id: string
          product_type: string
          purchased_at: string
          updated_at: string
        }
        Insert: {
          billed_to_id: string
          billing_skipped_at?: string | null
          billing_skipped_reason?: string | null
          created_at?: string
          created_by?: string | null
          default_horse_id?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          package_price: number
          package_size?: number
          person_id: string
          product_type: string
          purchased_at: string
          updated_at?: string
        }
        Update: {
          billed_to_id?: string
          billing_skipped_at?: string | null
          billing_skipped_reason?: string | null
          created_at?: string
          created_by?: string | null
          default_horse_id?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          package_price?: number
          package_size?: number
          person_id?: string
          product_type?: string
          purchased_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_package_billed_to_id_fkey"
            columns: ["billed_to_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_package_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_package_default_horse_id_fkey"
            columns: ["default_horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_package_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_package_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_rider: {
        Row: {
          cancelled_at: string | null
          cancelled_by_id: string | null
          counts_against_allowance: boolean
          created_at: string
          deleted_at: string | null
          horse_id: string | null
          id: string
          lesson_id: string
          makeup_token_id: string | null
          package_id: string | null
          rider_id: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          counts_against_allowance?: boolean
          created_at?: string
          deleted_at?: string | null
          horse_id?: string | null
          id?: string
          lesson_id: string
          makeup_token_id?: string | null
          package_id?: string | null
          rider_id: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by_id?: string | null
          counts_against_allowance?: boolean
          created_at?: string
          deleted_at?: string | null
          horse_id?: string | null
          id?: string
          lesson_id?: string
          makeup_token_id?: string | null
          package_id?: string | null
          rider_id?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_rider_cancelled_by_id_fkey"
            columns: ["cancelled_by_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_rider_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_rider_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_rider_makeup_token_fk"
            columns: ["makeup_token_id"]
            isOneToOne: false
            referencedRelation: "makeup_token"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_rider_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "lesson_package"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_rider_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_rider_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "lesson_subscription"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_subscription: {
        Row: {
          billed_to_id: string
          billing_date: string | null
          cancellation_deadline: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          default_horse_id: string | null
          deleted_at: string | null
          enrolled_at: string
          id: string
          instructor_id: string
          invoice_id: string | null
          is_prorated: boolean
          lesson_day: Database["public"]["Enums"]["day_of_week"]
          lesson_time: string
          makeup_notes: string | null
          prorated_lesson_count: number | null
          prorated_price: number | null
          quarter_id: string
          renewal_intent: Database["public"]["Enums"]["renewal_intent"]
          rider_id: string
          status: Database["public"]["Enums"]["lesson_subscription_status"]
          subscription_price: number
          subscription_type: Database["public"]["Enums"]["lesson_subscription_type"]
          updated_at: string
        }
        Insert: {
          billed_to_id: string
          billing_date?: string | null
          cancellation_deadline?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          default_horse_id?: string | null
          deleted_at?: string | null
          enrolled_at?: string
          id?: string
          instructor_id: string
          invoice_id?: string | null
          is_prorated?: boolean
          lesson_day: Database["public"]["Enums"]["day_of_week"]
          lesson_time: string
          makeup_notes?: string | null
          prorated_lesson_count?: number | null
          prorated_price?: number | null
          quarter_id: string
          renewal_intent?: Database["public"]["Enums"]["renewal_intent"]
          rider_id: string
          status?: Database["public"]["Enums"]["lesson_subscription_status"]
          subscription_price: number
          subscription_type?: Database["public"]["Enums"]["lesson_subscription_type"]
          updated_at?: string
        }
        Update: {
          billed_to_id?: string
          billing_date?: string | null
          cancellation_deadline?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          default_horse_id?: string | null
          deleted_at?: string | null
          enrolled_at?: string
          id?: string
          instructor_id?: string
          invoice_id?: string | null
          is_prorated?: boolean
          lesson_day?: Database["public"]["Enums"]["day_of_week"]
          lesson_time?: string
          makeup_notes?: string | null
          prorated_lesson_count?: number | null
          prorated_price?: number | null
          quarter_id?: string
          renewal_intent?: Database["public"]["Enums"]["renewal_intent"]
          rider_id?: string
          status?: Database["public"]["Enums"]["lesson_subscription_status"]
          subscription_price?: number
          subscription_type?: Database["public"]["Enums"]["lesson_subscription_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_subscription_billed_to_id_fkey"
            columns: ["billed_to_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_subscription_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_subscription_default_horse_id_fkey"
            columns: ["default_horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_subscription_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_subscription_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_subscription_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_subscription_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      makeup_token: {
        Row: {
          created_at: string
          created_by: string | null
          grant_reason: string | null
          id: string
          notes: string | null
          official_expires_at: string
          original_lesson_id: string | null
          quarter_id: string
          reason: Database["public"]["Enums"]["makeup_token_reason"]
          rider_id: string
          scheduled_lesson_id: string | null
          status: Database["public"]["Enums"]["makeup_token_status"]
          status_changed_at: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          grant_reason?: string | null
          id?: string
          notes?: string | null
          official_expires_at: string
          original_lesson_id?: string | null
          quarter_id: string
          reason: Database["public"]["Enums"]["makeup_token_reason"]
          rider_id: string
          scheduled_lesson_id?: string | null
          status?: Database["public"]["Enums"]["makeup_token_status"]
          status_changed_at?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          grant_reason?: string | null
          id?: string
          notes?: string | null
          official_expires_at?: string
          original_lesson_id?: string | null
          quarter_id?: string
          reason?: Database["public"]["Enums"]["makeup_token_reason"]
          rider_id?: string
          scheduled_lesson_id?: string | null
          status?: Database["public"]["Enums"]["makeup_token_status"]
          status_changed_at?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "makeup_token_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_token_original_lesson_id_fkey"
            columns: ["original_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_token_quarter_id_fkey"
            columns: ["quarter_id"]
            isOneToOne: false
            referencedRelation: "quarter"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_token_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_token_scheduled_lesson_id_fkey"
            columns: ["scheduled_lesson_id"]
            isOneToOne: false
            referencedRelation: "lesson"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "makeup_token_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "lesson_subscription"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preference: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          deleted_at: string | null
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          opted_out: boolean
          person_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deleted_at?: string | null
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          opted_out?: boolean
          person_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          deleted_at?: string | null
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          opted_out?: boolean
          person_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_preference_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preference_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      person: {
        Row: {
          address: string | null
          auth_user_id: string | null
          calendar_color: string | null
          created_at: string
          custom_fields: Json | null
          date_of_birth: string | null
          default_training_ride_rate: number
          deleted_at: string | null
          email: string | null
          first_name: string
          guardian_id: string | null
          height: string | null
          ical_token: string | null
          id: string
          is_minor: boolean
          is_organization: boolean
          is_training_ride_provider: boolean
          last_name: string
          notes: string | null
          organization_name: string | null
          phone: string | null
          preferred_language: Database["public"]["Enums"]["person_preferred_language"]
          preferred_name: string | null
          provider_type: string | null
          riding_level:
            | Database["public"]["Enums"]["person_riding_level"]
            | null
          stripe_customer_id: string | null
          updated_at: string
          usef_id: string | null
          weight_category:
            | Database["public"]["Enums"]["person_weight_category"]
            | null
        }
        Insert: {
          address?: string | null
          auth_user_id?: string | null
          calendar_color?: string | null
          created_at?: string
          custom_fields?: Json | null
          date_of_birth?: string | null
          default_training_ride_rate?: number
          deleted_at?: string | null
          email?: string | null
          first_name: string
          guardian_id?: string | null
          height?: string | null
          ical_token?: string | null
          id?: string
          is_minor?: boolean
          is_organization?: boolean
          is_training_ride_provider?: boolean
          last_name: string
          notes?: string | null
          organization_name?: string | null
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["person_preferred_language"]
          preferred_name?: string | null
          provider_type?: string | null
          riding_level?:
            | Database["public"]["Enums"]["person_riding_level"]
            | null
          stripe_customer_id?: string | null
          updated_at?: string
          usef_id?: string | null
          weight_category?:
            | Database["public"]["Enums"]["person_weight_category"]
            | null
        }
        Update: {
          address?: string | null
          auth_user_id?: string | null
          calendar_color?: string | null
          created_at?: string
          custom_fields?: Json | null
          date_of_birth?: string | null
          default_training_ride_rate?: number
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          guardian_id?: string | null
          height?: string | null
          ical_token?: string | null
          id?: string
          is_minor?: boolean
          is_organization?: boolean
          is_training_ride_provider?: boolean
          last_name?: string
          notes?: string | null
          organization_name?: string | null
          phone?: string | null
          preferred_language?: Database["public"]["Enums"]["person_preferred_language"]
          preferred_name?: string | null
          provider_type?: string | null
          riding_level?:
            | Database["public"]["Enums"]["person_riding_level"]
            | null
          stripe_customer_id?: string | null
          updated_at?: string
          usef_id?: string | null
          weight_category?:
            | Database["public"]["Enums"]["person_weight_category"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "person_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      person_role: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          deleted_at: string | null
          id: string
          person_id: string
          role: Database["public"]["Enums"]["person_role_type"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id: string
          role: Database["public"]["Enums"]["person_role_type"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          deleted_at?: string | null
          id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["person_role_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_role_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_role_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_qr_code: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          provider_person_id: string
          service_id: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          provider_person_id: string
          service_id: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          provider_person_id?: string
          service_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_qr_code_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_qr_code_provider_person_id_fkey"
            columns: ["provider_person_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_qr_code_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "board_service"
            referencedColumns: ["id"]
          },
        ]
      }
      quarter: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          end_date: string
          id: string
          is_active: boolean
          label: string
          mr_year: number
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          label: string
          mr_year: number
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          label?: string
          mr_year?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarter_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      training_ride: {
        Row: {
          billing_line_item_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          horse_event_id: string | null
          horse_id: string
          id: string
          logged_at: string | null
          logged_by_id: string | null
          notes: string | null
          ride_date: string
          rider_id: string
          status: Database["public"]["Enums"]["training_ride_status"]
          unit_price: number
          updated_at: string
        }
        Insert: {
          billing_line_item_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          horse_event_id?: string | null
          horse_id: string
          id?: string
          logged_at?: string | null
          logged_by_id?: string | null
          notes?: string | null
          ride_date: string
          rider_id: string
          status?: Database["public"]["Enums"]["training_ride_status"]
          unit_price?: number
          updated_at?: string
        }
        Update: {
          billing_line_item_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          horse_event_id?: string | null
          horse_id?: string
          id?: string
          logged_at?: string | null
          logged_by_id?: string | null
          notes?: string | null
          ride_date?: string
          rider_id?: string
          status?: Database["public"]["Enums"]["training_ride_status"]
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_ride_billing_line_item_id_fkey"
            columns: ["billing_line_item_id"]
            isOneToOne: false
            referencedRelation: "billing_line_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_ride_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_ride_horse_event_id_fkey"
            columns: ["horse_event_id"]
            isOneToOne: false
            referencedRelation: "horse_event"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_ride_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_ride_logged_by_id_fkey"
            columns: ["logged_by_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_ride_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
        ]
      }
      vet_visit: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          findings: string | null
          horse_id: string
          id: string
          imported_from_document_id: string | null
          reason: string | null
          recommendations: string | null
          updated_at: string
          vet_name: string | null
          vet_practice: string | null
          visit_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          findings?: string | null
          horse_id: string
          id?: string
          imported_from_document_id?: string | null
          reason?: string | null
          recommendations?: string | null
          updated_at?: string
          vet_name?: string | null
          vet_practice?: string | null
          visit_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          findings?: string | null
          horse_id?: string
          id?: string
          imported_from_document_id?: string | null
          reason?: string | null
          recommendations?: string | null
          updated_at?: string
          vet_name?: string | null
          vet_practice?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "vet_visit_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "person"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vet_visit_horse_id_fkey"
            columns: ["horse_id"]
            isOneToOne: false
            referencedRelation: "horse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vet_visit_imported_from_document_id_fkey"
            columns: ["imported_from_document_id"]
            isOneToOne: false
            referencedRelation: "document"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_person_id: { Args: never; Returns: string }
      has_role: {
        Args: { check_role: Database["public"]["Enums"]["person_role_type"] }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
    }
    Enums: {
      billing_line_item_status: "draft" | "reviewed"
      board_service_log_status:
        | "logged"
        | "pending_review"
        | "reviewed"
        | "invoiced"
        | "voided"
      camp_enrollment_status: "enrolled" | "waitlisted" | "cancelled"
      camp_session_status: "open" | "closed" | "cancelled"
      custom_field_entity_type: "horse" | "person"
      custom_field_field_type: "text" | "number" | "date" | "boolean"
      custom_field_section:
        | "identity"
        | "daily_care"
        | "health"
        | "scheduling"
        | "admin"
      custom_field_visibility_tier: "always" | "collapsible" | "internal_only"
      day_of_week:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
      horse_event_type:
        | "lesson"
        | "training_ride"
        | "medication"
        | "lunge"
        | "treatment"
        | "board_service"
        | "vet_visit"
        | "other"
      horse_status: "pending" | "active" | "away" | "archived"
      invoice_line_item_type: "standard" | "adjustment" | "credit"
      invoice_status:
        | "draft"
        | "pending_review"
        | "sent"
        | "opened"
        | "paid"
        | "overdue"
      lesson_status:
        | "pending"
        | "scheduled"
        | "completed"
        | "cancelled_rider"
        | "cancelled_barn"
        | "no_show"
      lesson_subscription_status:
        | "pending"
        | "active"
        | "cancelled"
        | "completed"
      lesson_subscription_type: "standard" | "boarder"
      lesson_type: "private" | "semi_private" | "group"
      log_source: "app" | "qr_code" | "admin"
      makeup_token_reason: "rider_cancel" | "barn_cancel" | "admin_grant"
      makeup_token_status: "available" | "scheduled" | "used" | "expired"
      notification_channel: "email" | "sms"
      notification_type:
        | "lesson_reminder"
        | "lesson_cancellation"
        | "lesson_confirmation"
        | "lesson_type_change"
        | "health_alert"
        | "invoice"
        | "makeup_token"
        | "renewal_notice"
      person_preferred_language: "english" | "spanish"
      person_riding_level: "beginner" | "intermediate" | "advanced"
      person_role_type:
        | "rider"
        | "boarder"
        | "instructor"
        | "admin"
        | "barn_owner"
        | "barn_worker"
        | "service_provider"
      person_weight_category: "light" | "medium" | "heavy"
      renewal_intent: "renewing" | "not_renewing"
      training_ride_status: "scheduled" | "logged"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      billing_line_item_status: ["draft", "reviewed"],
      board_service_log_status: [
        "logged",
        "pending_review",
        "reviewed",
        "invoiced",
        "voided",
      ],
      camp_enrollment_status: ["enrolled", "waitlisted", "cancelled"],
      camp_session_status: ["open", "closed", "cancelled"],
      custom_field_entity_type: ["horse", "person"],
      custom_field_field_type: ["text", "number", "date", "boolean"],
      custom_field_section: [
        "identity",
        "daily_care",
        "health",
        "scheduling",
        "admin",
      ],
      custom_field_visibility_tier: ["always", "collapsible", "internal_only"],
      day_of_week: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      horse_event_type: [
        "lesson",
        "training_ride",
        "medication",
        "lunge",
        "treatment",
        "board_service",
        "vet_visit",
        "other",
      ],
      horse_status: ["pending", "active", "away", "archived"],
      invoice_line_item_type: ["standard", "adjustment", "credit"],
      invoice_status: [
        "draft",
        "pending_review",
        "sent",
        "opened",
        "paid",
        "overdue",
      ],
      lesson_status: [
        "pending",
        "scheduled",
        "completed",
        "cancelled_rider",
        "cancelled_barn",
        "no_show",
      ],
      lesson_subscription_status: [
        "pending",
        "active",
        "cancelled",
        "completed",
      ],
      lesson_subscription_type: ["standard", "boarder"],
      lesson_type: ["private", "semi_private", "group"],
      log_source: ["app", "qr_code", "admin"],
      makeup_token_reason: ["rider_cancel", "barn_cancel", "admin_grant"],
      makeup_token_status: ["available", "scheduled", "used", "expired"],
      notification_channel: ["email", "sms"],
      notification_type: [
        "lesson_reminder",
        "lesson_cancellation",
        "lesson_confirmation",
        "lesson_type_change",
        "health_alert",
        "invoice",
        "makeup_token",
        "renewal_notice",
      ],
      person_preferred_language: ["english", "spanish"],
      person_riding_level: ["beginner", "intermediate", "advanced"],
      person_role_type: [
        "rider",
        "boarder",
        "instructor",
        "admin",
        "barn_owner",
        "barn_worker",
        "service_provider",
      ],
      person_weight_category: ["light", "medium", "heavy"],
      renewal_intent: ["renewing", "not_renewing"],
      training_ride_status: ["scheduled", "logged"],
    },
  },
} as const
