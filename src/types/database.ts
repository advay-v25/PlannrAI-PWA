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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      profile_preferences: {
        Row: {
          allow_weekend_work: boolean | null
          ask_before_changes: boolean | null
          buffer_min: number | null
          calendar_integration_enabled: boolean | null
          diet_type: string | null
          is_workout_protected: boolean | null
          low_energy_mode: boolean | null
          max_ai_options: number | null
          max_daily_load_min: number | null
          meal_windows: Json | null
          meals_per_day: number | null
          notification_times: Json | null
          notifications_enabled: boolean | null
          overwhelm_mode: boolean | null
          pillar_spacing_preference: string | null
          preferred_windows: Json | null
          proactive_level: string | null
          sleep_start: string | null
          updated_at: string | null
          user_id: string
          wake_time: string | null
          weekend_intensity: string | null
          wind_down_min: number | null
          workout_min_per_day: number | null
          workout_preference: string | null
          allergies: Json | null
        }
        Insert: {
          allow_weekend_work?: boolean | null
          ask_before_changes?: boolean | null
          buffer_min?: number | null
          calendar_integration_enabled?: boolean | null
          diet_type?: string | null
          is_workout_protected?: boolean | null
          low_energy_mode?: boolean | null
          max_ai_options?: number | null
          max_daily_load_min?: number | null
          meal_windows?: Json | null
          meals_per_day?: number | null
          notification_times?: Json | null
          notifications_enabled?: boolean | null
          overwhelm_mode?: boolean | null
          pillar_spacing_preference?: string | null
          preferred_windows?: Json | null
          proactive_level?: string | null
          sleep_start?: string | null
          updated_at?: string | null
          user_id: string
          wake_time?: string | null
          weekend_intensity?: string | null
          wind_down_min?: number | null
          workout_min_per_day?: number | null
          workout_preference?: string | null
          allergies?: Json | null
        }
        Update: {
          allow_weekend_work?: boolean | null
          ask_before_changes?: boolean | null
          buffer_min?: number | null
          calendar_integration_enabled?: boolean | null
          diet_type?: string | null
          is_workout_protected?: boolean | null
          low_energy_mode?: boolean | null
          max_ai_options?: number | null
          max_daily_load_min?: number | null
          meal_windows?: Json | null
          meals_per_day?: number | null
          notification_times?: Json | null
          notifications_enabled?: boolean | null
          overwhelm_mode?: boolean | null
          pillar_spacing_preference?: string | null
          preferred_windows?: Json | null
          proactive_level?: string | null
          sleep_start?: string | null
          updated_at?: string | null
          user_id?: string
          wake_time?: string | null
          weekend_intensity?: string | null
          wind_down_min?: number | null
          workout_min_per_day?: number | null
          workout_preference?: string | null
          allergies?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_options: {
        Row: {
          context_snapshot: Json | null
          created_at: string
          expires_at: string
          id: string
          label: string
          patch: Json
          user_id: string
        }
        Insert: {
          context_snapshot?: Json | null
          created_at?: string
          expires_at?: string
          id?: string
          label: string
          patch: Json
          user_id: string
        }
        Update: {
          context_snapshot?: Json | null
          created_at?: string
          expires_at?: string
          id?: string
          label?: string
          patch?: Json
          user_id?: string
        }
        Relationships: []
      }
      ai_interventions: {
        Row: {
          action_taken_at: string | null
          created_at: string | null
          id: string
          message: string
          payload: Json | null
          status: string | null
          type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          action_taken_at?: string | null
          created_at?: string | null
          id?: string
          message: string
          payload?: Json | null
          status?: string | null
          type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          action_taken_at?: string | null
          created_at?: string | null
          id?: string
          message?: string
          payload?: Json | null
          status?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_proposals: {
        Row: {
          action_data: Json
          created_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          priority: number | null
          proposal_type: string
          responded_at: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_data: Json
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          priority?: number | null
          proposal_type: string
          responded_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_data?: Json
          created_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          priority?: number | null
          proposal_type?: string
          responded_at?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_attempts: {
        Row: {
          attempts: number | null
          blocked_until: string | null
          ip_address: unknown
          last_attempt: string | null
        }
        Insert: {
          attempts?: number | null
          blocked_until?: string | null
          ip_address: unknown
          last_attempt?: string | null
        }
        Update: {
          attempts?: number | null
          blocked_until?: string | null
          ip_address?: unknown
          last_attempt?: string | null
        }
        Relationships: []
      }
      behavior_events: {
        Row: {
          action_type: string
          created_at: string
          event_id: string | null
          id: string
          meta: Json | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          event_id?: string | null
          id?: string
          meta?: Json | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          event_id?: string | null
          id?: string
          meta?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_patterns: {
        Row: {
          avoidance_data: Json | null
          completion_rates: Json | null
          confidence_score: number | null
          density_tolerance: Json | null
          id: string
          preferred_windows: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avoidance_data?: Json | null
          completion_rates?: Json | null
          confidence_score?: number | null
          density_tolerance?: Json | null
          id?: string
          preferred_windows?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avoidance_data?: Json | null
          completion_rates?: Json | null
          confidence_score?: number | null
          density_tolerance?: Json | null
          id?: string
          preferred_windows?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_patterns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      block_logs: {
        Row: {
          ai_analysis: Json | null
          block_id: string
          created_at: string | null
          deviation_type: string | null
          id: string
          log_date: string
          reason: string | null
          status: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          block_id: string
          created_at?: string | null
          deviation_type?: string | null
          id?: string
          log_date?: string
          reason?: string | null
          status?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          block_id?: string
          created_at?: string | null
          deviation_type?: string | null
          id?: string
          log_date?: string
          reason?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "block_logs_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_dump_entries: {
        Row: {
          created_at: string | null
          extracted_json: Json | null
          id: string
          raw_text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          extracted_json?: Json | null
          id?: string
          raw_text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          extracted_json?: Json | null
          id?: string
          raw_text?: string
          user_id?: string
        }
        Relationships: []
      }
      brain_dumps: {
        Row: {
          ai_categories: string[] | null
          ai_sentiment: string | null
          ai_themes: string[] | null
          content: string
          created_at: string | null
          detected_constraints: Json | null
          extracted_signals: Json | null
          id: string
          user_id: string
        }
        Insert: {
          ai_categories?: string[] | null
          ai_sentiment?: string | null
          ai_themes?: string[] | null
          content: string
          created_at?: string | null
          detected_constraints?: Json | null
          extracted_signals?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          ai_categories?: string[] | null
          ai_sentiment?: string | null
          ai_themes?: string[] | null
          content?: string
          created_at?: string | null
          detected_constraints?: Json | null
          extracted_signals?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_dumps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_interactions: {
        Row: {
          coach_response: Json | null
          created_at: string | null
          id: string
          user_action: string | null
          user_id: string
          user_message: string | null
        }
        Insert: {
          coach_response?: Json | null
          created_at?: string | null
          id?: string
          user_action?: string | null
          user_id: string
          user_message?: string | null
        }
        Update: {
          coach_response?: Json | null
          created_at?: string | null
          id?: string
          user_action?: string | null
          user_id?: string
          user_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coach_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coach_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_threads: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      commitments: {
        Row: {
          checklist: Json | null
          days_of_week: number[] | null
          end_time: string
          flexible_frequency_per_week: number | null
          id: string
          is_active: boolean | null
          preferred_time_window: string | null
          start_time: string
          title: string
          user_id: string
        }
        Insert: {
          checklist?: Json | null
          days_of_week?: number[] | null
          end_time: string
          flexible_frequency_per_week?: number | null
          id?: string
          is_active?: boolean | null
          preferred_time_window?: string | null
          start_time: string
          title: string
          user_id: string
        }
        Update: {
          checklist?: Json | null
          days_of_week?: number[] | null
          end_time?: string
          flexible_frequency_per_week?: number | null
          id?: string
          is_active?: boolean | null
          preferred_time_window?: string | null
          start_time?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          title: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          title?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          title?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          challenges: string[] | null
          created_at: string | null
          energy_level: number | null
          gratitude: string[] | null
          id: string
          log_date: string
          mood: string | null
          signals: Json | null
          updated_at: string | null
          user_id: string
          wins: string[] | null
        }
        Insert: {
          challenges?: string[] | null
          created_at?: string | null
          energy_level?: number | null
          gratitude?: string[] | null
          id?: string
          log_date?: string
          mood?: string | null
          signals?: Json | null
          updated_at?: string | null
          user_id: string
          wins?: string[] | null
        }
        Update: {
          challenges?: string[] | null
          created_at?: string | null
          energy_level?: number | null
          gratitude?: string[] | null
          id?: string
          log_date?: string
          mood?: string | null
          signals?: Json | null
          updated_at?: string | null
          user_id?: string
          wins?: string[] | null
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          cognitive_load_score: number | null
          created_at: string | null
          date: string
          dominant_mode: string | null
          fragmentation_score: number | null
          id: string
          physical_load_score: number | null
          total_active_mins: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cognitive_load_score?: number | null
          created_at?: string | null
          date: string
          dominant_mode?: string | null
          fragmentation_score?: number | null
          id?: string
          physical_load_score?: number | null
          total_active_mins?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cognitive_load_score?: number | null
          created_at?: string | null
          date?: string
          dominant_mode?: string | null
          fragmentation_score?: number | null
          id?: string
          physical_load_score?: number | null
          total_active_mins?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      goals: {
        Row: {
          ai_routine: Json | null
          ai_strategy: Json | null
          category: string
          constraints: Json | null
          created_at: string | null
          days_per_week: number | null
          description: string | null
          energy_demand: string | null
          energy: string | null
          id: string
          importance: string | null
          priority: string | null
          pillar: string | null
          is_paused: boolean | null
          milestone_progress: number | null
          minutes_per_day: number | null
          non_negotiables: string[] | null
          notes: string | null
          parent_id: string | null
          preferred_windows: string[] | null
          sort_order: number | null
          status: string | null
          time_commitment_mins: number | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_routine?: Json | null
          ai_strategy?: Json | null
          category: string
          constraints?: Json | null
          created_at?: string | null
          days_per_week?: number | null
          description?: string | null
          energy_demand?: string | null
          energy?: string | null
          id?: string
          importance?: string | null
          priority?: string | null
          pillar?: string | null
          is_paused?: boolean | null
          milestone_progress?: number | null
          minutes_per_day?: number | null
          non_negotiables?: string[] | null
          notes?: string | null
          parent_id?: string | null
          sort_order?: number | null
          status?: string | null
          time_commitment_mins?: number | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_routine?: Json | null
          ai_strategy?: Json | null
          category?: string
          constraints?: Json | null
          created_at?: string | null
          days_per_week?: number | null
          description?: string | null
          energy_demand?: string | null
          energy?: string | null
          id?: string
          importance?: string | null
          priority?: string | null
          pillar?: string | null
          is_paused?: boolean | null
          milestone_progress?: number | null
          minutes_per_day?: number | null
          non_negotiables?: string[] | null
          notes?: string | null
          parent_id?: string | null
          sort_order?: number | null
          status?: string | null
          time_commitment_mins?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_instances: {
        Row: {
          created_at: string | null
          date: string
          habit_stack_id: string
          id: string
          schedule_block_id: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          habit_stack_id: string
          id?: string
          schedule_block_id?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          habit_stack_id?: string
          id?: string
          schedule_block_id?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_instances_habit_stack_id_fkey"
            columns: ["habit_stack_id"]
            isOneToOne: false
            referencedRelation: "habit_stacks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_instances_schedule_block_id_fkey"
            columns: ["schedule_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_stacks: {
        Row: {
          action_duration_mins: number | null
          action_habit: string
          created_at: string | null
          current_streak: number | null
          duration_min: number | null // NEW
          enabled: boolean | null // NEW
          goal_id: string | null
          grace_days_used: number | null
          id: string
          is_active: boolean | null
          last_completed: string | null
          preferred_window: string | null // NEW


          max_grace_days: number | null
          total_completions: number | null
          trigger_habit: string
          trigger_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_duration_mins?: number | null
          action_habit: string
          created_at?: string | null
          current_streak?: number | null
          goal_id?: string | null
          grace_days_used?: number | null
          id?: string
          is_active?: boolean | null
          last_completed?: string | null
          longest_streak?: number | null
          max_grace_days?: number | null
          total_completions?: number | null
          trigger_habit: string
          trigger_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_duration_mins?: number | null
          action_habit?: string
          created_at?: string | null
          current_streak?: number | null
          goal_id?: string | null
          grace_days_used?: number | null
          id?: string
          is_active?: boolean | null
          last_completed?: string | null
          longest_streak?: number | null
          max_grace_days?: number | null
          total_completions?: number | null
          trigger_habit?: string
          trigger_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_stacks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      intervention_logs: {
        Row: {
          action_taken_at: string | null
          created_at: string | null
          id: string
          message: string | null
          status: string | null
          type: string
          user_id: string
        }
        Insert: {
          action_taken_at?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          status?: string | null
          type: string
          user_id: string
        }
        Update: {
          action_taken_at?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          status?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_facts: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          key: string
          kind: string
          source_event_id: string | null
          updated_at: string | null
          user_id: string
          value: Json
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          key: string
          kind: string
          source_event_id?: string | null
          updated_at?: string | null
          user_id: string
          value: Json
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          key?: string
          kind?: string
          source_event_id?: string | null
          updated_at?: string | null
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      patch_runs: {
        Row: {
          applied: boolean | null
          created_at: string
          id: string
          inverse_patch: Json
          patch: Json
          source: string
          user_id: string
        }
        Insert: {
          applied?: boolean | null
          created_at?: string
          id?: string
          inverse_patch: Json
          patch: Json
          source: string
          user_id: string
        }
        Update: {
          applied?: boolean | null
          created_at?: string
          id?: string
          inverse_patch?: Json
          patch?: Json
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patch_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_can_analyze: boolean | null
          ai_can_draft: boolean | null
          ai_can_suggest: boolean | null
          behavior_patterns_id: string | null
          bio_data: Json | null
          bio_scan_url: string | null
          body_preferences: Json | null
          buffer_config: Json | null
          buffer_minutes: number | null
          created_at: string | null
          energy_level: number | null
          full_name: string | null
          id: string
          low_energy_mode: boolean | null
          meal_preferences: Json | null
          meal_duration_minutes: number | null
          meal_windows: Json | null
          meals_per_day: number | null
          onboarding_complete: boolean | null
          pillar_preferences: Json | null
          preferred_name: string | null
          preferred_workdays: number[] | null
          sleep_end: string | null
          sleep_start: string | null
          stress_level: number | null
          timezone: string | null
          updated_at: string | null
          weekend_intensity: string | null
          wind_down_mins: number | null
        }
        Insert: {
          ai_can_analyze?: boolean | null
          ai_can_draft?: boolean | null
          ai_can_suggest?: boolean | null
          bio_data?: Json | null
          bio_scan_url?: string | null
          body_preferences?: Json | null
          buffer_config?: Json | null
          buffer_minutes?: number | null
          created_at?: string | null
          energy_level?: number | null
          full_name?: string | null
          id: string
          low_energy_mode?: boolean | null
          meal_preferences?: Json | null
          meal_duration_minutes?: number | null
          meal_windows?: Json | null
          meals_per_day?: number | null
          onboarding_complete?: boolean | null
          pillar_preferences?: Json | null
          preferred_name?: string | null
          preferred_workdays?: number[] | null
          sleep_end?: string | null
          sleep_start?: string | null
          stress_level?: number | null
          timezone?: string | null
          updated_at?: string | null
          weekend_intensity?: string | null
          wind_down_mins?: number | null
        }
        Update: {
          ai_can_analyze?: boolean | null
          ai_can_draft?: boolean | null
          ai_can_suggest?: boolean | null
          bio_data?: Json | null
          bio_scan_url?: string | null
          body_preferences?: Json | null
          buffer_config?: Json | null
          buffer_minutes?: number | null
          created_at?: string | null
          energy_level?: number | null
          full_name?: string | null
          id?: string
          low_energy_mode?: boolean | null
          meal_preferences?: Json | null
          meal_duration_minutes?: number | null
          meal_windows?: Json | null
          meals_per_day?: number | null
          onboarding_complete?: boolean | null
          pillar_preferences?: Json | null
          preferred_name?: string | null
          preferred_workdays?: number[] | null
          sleep_end?: string | null
          sleep_start?: string | null
          stress_level?: number | null
          timezone?: string | null
          updated_at?: string | null
          weekend_intensity?: string | null
          wind_down_mins?: number | null
        }
        Relationships: []
      }
      routine_recommendations: {
        Row: {
          accepted: boolean | null
          calendar_event_id: string | null
          created_at: string | null
          id: string
          routine: Json
          routine_type: string
          source: string
          user_id: string
        }
        Insert: {
          accepted?: boolean | null
          calendar_event_id?: string | null
          created_at?: string | null
          id?: string
          routine: Json
          routine_type: string
          source: string
          user_id: string
        }
        Update: {
          accepted?: boolean | null
          calendar_event_id?: string | null
          created_at?: string | null
          id?: string
          routine?: Json
          routine_type?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_recommendations_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_sessions: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          image_url: string | null
          notes: string | null
          readable: boolean | null
          signals: Json | null
          store_mode: string
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          readable?: boolean | null
          signals?: Json | null
          store_mode: string
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          readable?: boolean | null
          signals?: Json | null
          store_mode?: string
          user_id?: string
        }
        Relationships: []
      }
      schedule_blocks: {
        Row: {
          block_type: string | null
          checklist: Json | null
          commitment_id: string | null
          context: string | null
          created_at: string | null
          date: string
          end_time: string
          energy_cost: string | null
          goal_id: string | null
          habit_stack_id: string | null // NEW
          id: string
          is_fixed: boolean | null
          is_locked: boolean | null
          meta: Json | null
          pillar: string | null
          priority: number | null
          source: string | null
          start_time: string
          status: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          block_type?: string | null
          checklist?: Json | null
          commitment_id?: string | null
          context?: string | null
          created_at?: string | null
          date: string
          end_time: string
          energy_cost?: string | null
          goal_id?: string | null
          id?: string
          is_fixed?: boolean | null
          is_locked?: boolean | null
          meta?: Json | null
          pillar?: string | null
          priority?: number | null
          source?: string | null
          start_time: string
          status?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          block_type?: string | null
          checklist?: Json | null
          commitment_id?: string | null
          context?: string | null
          created_at?: string | null
          date?: string
          end_time?: string
          energy_cost?: string | null
          goal_id?: string | null
          id?: string
          is_fixed?: boolean | null
          is_locked?: boolean | null
          meta?: Json | null
          pillar?: string | null
          priority?: number | null
          source?: string | null
          start_time?: string
          status?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_versions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          snapshot: Json
          source: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          snapshot?: Json
          source: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          snapshot?: Json
          source?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      session_bindings: {
        Row: {
          created_at: string | null
          id: string
          ip_address: unknown
          is_valid: boolean | null
          last_seen: string | null
          session_hash: string
          user_agent_hash: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          last_seen?: string | null
          session_hash: string
          user_agent_hash?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          ip_address?: unknown
          is_valid?: boolean | null
          last_seen?: string | null
          session_hash?: string
          user_agent_hash?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      streaks: {
        Row: {
          created_at: string | null
          current_streak: number | null
          goal_id: string | null
          grace_days_used: number | null
          habit_stack_id: string | null
          id: string
          last_completed: string | null
          longest_streak: number | null
          max_grace_days: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          goal_id?: string | null
          grace_days_used?: number | null
          habit_stack_id?: string | null
          id?: string
          last_completed?: string | null
          longest_streak?: number | null
          max_grace_days?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          goal_id?: string | null
          grace_days_used?: number | null
          habit_stack_id?: string | null
          id?: string
          last_completed?: string | null
          longest_streak?: number | null
          max_grace_days?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_habit_stack_id_fkey"
            columns: ["habit_stack_id"]
            isOneToOne: false
            referencedRelation: "habit_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_context: {
        Row: {
          confidence: number | null
          content: string
          created_at: string | null
          id: string
          last_used_at: string | null
          source: string | null
          type: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          content: string
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          source?: string | null
          type: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          content?: string
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          source?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_states: {
        Row: {
          cognitive_load: number | null
          current_mode: Database["public"]["Enums"]["user_mode"]
          emotional_bandwidth: number | null
          emotional_state: string | null
          energy_level: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cognitive_load?: number | null
          current_mode?: Database["public"]["Enums"]["user_mode"]
          emotional_bandwidth?: number | null
          emotional_state?: string | null
          energy_level?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cognitive_load?: number | null
          current_mode?: Database["public"]["Enums"]["user_mode"]
          emotional_bandwidth?: number | null
          emotional_state?: string | null
          energy_level?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weekly_reviews: {
        Row: {
          actual_minutes: number | null
          created_at: string | null
          energy_trend: string | null
          friction_patterns: Json | null
          id: string
          lever_action: Json | null
          planned_minutes: number | null
          stress_trend: string | null
          suggested_adjustment: string | null
          user_id: string
          user_response: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          actual_minutes?: number | null
          created_at?: string | null
          energy_trend?: string | null
          friction_patterns?: Json | null
          id?: string
          lever_action?: Json | null
          planned_minutes?: number | null
          stress_trend?: string | null
          suggested_adjustment?: string | null
          user_id: string
          user_response?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          actual_minutes?: number | null
          created_at?: string | null
          energy_trend?: string | null
          friction_patterns?: Json | null
          id?: string
          lever_action?: Json | null
          planned_minutes?: number | null
          stress_trend?: string | null
          suggested_adjustment?: string | null
          user_id?: string
          user_response?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_auth_attempt: {
        Args: { p_ip_address: unknown }
        Returns: {
          attempts_remaining: number
          is_blocked: boolean
        }[]
      }
      cleanup_old_audit_logs: { Args: never; Returns: undefined }
      update_streak: {
        Args: {
          p_goal_id?: string
          p_habit_stack_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      block_type: "anchor" | "body" | "craft" | "mind" | "meal" | "buffer"
      user_mode: "survival" | "maintenance" | "growth"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_type: ["anchor", "body", "craft", "mind", "meal", "buffer"],
      user_mode: ["survival", "maintenance", "growth"],
    },
  },
} as const

export type ScheduleBlock = Tables<'schedule_blocks'>;
export type Goal = Tables<'goals'>;
export type HabitStack = Tables<'habit_stacks'>;
export type HabitInstance = Tables<'habit_instances'>;
export type InterventionLog = Tables<'intervention_logs'>;
export type Commitment = Tables<'commitments'>;
export type BlockStatus = string;
export type Profile = Tables<'profiles'> & {
  preferred_workdays?: number[];
  weekend_intensity?: 'normal' | 'light' | 'off';
};

export interface GoalCapacity {
  available_min_per_day: number;
  committed_min_per_day: number;
  over_by_min_per_day: number;
  percentage: number;
}

