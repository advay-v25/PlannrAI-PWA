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
      ai_audit_log: {
        Row: {
          action: string
          cost_usd: number | null
          created_at: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          metadata: Json | null
          model: string | null
          output_tokens: number | null
          user_id: string
        }
        Insert: {
          action: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          user_id: string
        }
        Update: {
          action?: string
          cost_usd?: number | null
          created_at?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          metadata?: Json | null
          model?: string | null
          output_tokens?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          action_data: Json | null
          created_at: string | null
          id: string
          insight_type: string
          is_resolved: boolean | null
          message: string
          resolved_at: string | null
          user_id: string | null
        }
        Insert: {
          action_data?: Json | null
          created_at?: string | null
          id?: string
          insight_type: string
          is_resolved?: boolean | null
          message: string
          resolved_at?: string | null
          user_id?: string | null
        }
        Update: {
          action_data?: Json | null
          created_at?: string | null
          id?: string
          insight_type?: string
          is_resolved?: boolean | null
          message?: string
          resolved_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      block_completions: {
        Row: {
          actual_duration_minutes: number | null
          block_id: string | null
          completed_at: string | null
          deviation_type: string | null
          energy_level_after: number | null
          id: string
          notes: string | null
          user_id: string | null
        }
        Insert: {
          actual_duration_minutes?: number | null
          block_id?: string | null
          completed_at?: string | null
          deviation_type?: string | null
          energy_level_after?: number | null
          id?: string
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          actual_duration_minutes?: number | null
          block_id?: string | null
          completed_at?: string | null
          deviation_type?: string | null
          energy_level_after?: number | null
          id?: string
          notes?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_completions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      brain_dump_extractions: {
        Row: {
          brain_dump_id: string | null
          created_at: string | null
          extracted: Json
          id: string
          note: string | null
          options: Json | null
          user_id: string
        }
        Insert: {
          brain_dump_id?: string | null
          created_at?: string | null
          extracted?: Json
          id?: string
          note?: string | null
          options?: Json | null
          user_id: string
        }
        Update: {
          brain_dump_id?: string | null
          created_at?: string | null
          extracted?: Json
          id?: string
          note?: string | null
          options?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      brain_dump_items: {
        Row: {
          action_result: Json | null
          action_taken: string | null
          actioned_at: string | null
          brain_dump_id: string
          category: string
          content: string
          created_at: string | null
          entities: Json | null
          goal_id: string | null
          id: string
          schedule_block_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          action_result?: Json | null
          action_taken?: string | null
          actioned_at?: string | null
          brain_dump_id: string
          category: string
          content: string
          created_at?: string | null
          entities?: Json | null
          goal_id?: string | null
          id?: string
          schedule_block_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action_result?: Json | null
          action_taken?: string | null
          actioned_at?: string | null
          brain_dump_id?: string
          category?: string
          content?: string
          created_at?: string | null
          entities?: Json | null
          goal_id?: string | null
          id?: string
          schedule_block_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_dump_items_brain_dump_id_fkey"
            columns: ["brain_dump_id"]
            isOneToOne: false
            referencedRelation: "brain_dumps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dump_items_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dump_items_schedule_block_id_fkey"
            columns: ["schedule_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_dump_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_dumps: {
        Row: {
          created_at: string | null
          extracted_items: Json | null
          id: string
          processed: boolean
          processed_at: string | null
          raw_text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          extracted_items?: Json | null
          id?: string
          processed?: boolean
          processed_at?: string | null
          raw_text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          extracted_items?: Json | null
          id?: string
          processed?: boolean
          processed_at?: string | null
          raw_text?: string
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
      coach_conversations: {
        Row: {
          context: Json | null
          id: string
          is_active: boolean | null
          last_message_at: string | null
          started_at: string | null
          topic: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          started_at?: string | null
          topic?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          started_at?: string | null
          topic?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_conversations_user_id_fkey"
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
      coach_learnings: {
        Row: {
          category: string
          confidence_score: number
          conversation_id: string | null
          created_at: string | null
          id: string
          learning: string
          user_id: string
        }
        Insert: {
          category: string
          confidence_score: number
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          learning: string
          user_id: string
        }
        Update: {
          category?: string
          confidence_score?: number
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          learning?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_learnings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_learnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_messages: {
        Row: {
          action_proposed: Json | null
          action_status: string | null
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          role: string
        }
        Insert: {
          action_proposed?: Json | null
          action_status?: string | null
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
        }
        Update: {
          action_proposed?: Json | null
          action_status?: string | null
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "coach_conversations"
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
      energy_checkins: {
        Row: {
          checked_in_at: string | null
          context_note: string | null
          emotional_state: string | null
          energy_level: number | null
          id: string
          user_id: string | null
        }
        Insert: {
          checked_in_at?: string | null
          context_note?: string | null
          emotional_state?: string | null
          energy_level?: number | null
          id?: string
          user_id?: string | null
        }
        Update: {
          checked_in_at?: string | null
          context_note?: string | null
          emotional_state?: string | null
          energy_level?: number | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "energy_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          ai_routine: Json | null
          ai_strategy: Json | null
          category: string
          constraints: Json | null
          created_at: string | null
          current_streak_days: number | null
          cycle_end_date: string | null
          cycle_start_date: string | null
          days_per_week: number | null
          description: string | null
          energy: string | null
          energy_demand: string | null
          id: string
          importance: string | null
          is_paused: boolean | null
          level: number | null
          longest_streak_days: number | null
          milestone_progress: number | null
          minutes_per_day: number | null
          non_negotiables: string[] | null
          notes: string | null
          parent_id: string | null
          pillar: string | null
          preferred_windows: Json | null
          priority: string | null
          sort_order: number | null
          status: string | null
          time_commitment_mins: number | null
          title: string
          total_completed_minutes: number | null
          updated_at: string | null
          user_id: string
          weekly_target_minutes: number | null
        }
        Insert: {
          ai_routine?: Json | null
          ai_strategy?: Json | null
          category: string
          constraints?: Json | null
          created_at?: string | null
          current_streak_days?: number | null
          cycle_end_date?: string | null
          cycle_start_date?: string | null
          days_per_week?: number | null
          description?: string | null
          energy?: string | null
          energy_demand?: string | null
          id?: string
          importance?: string | null
          is_paused?: boolean | null
          level?: number | null
          longest_streak_days?: number | null
          milestone_progress?: number | null
          minutes_per_day?: number | null
          non_negotiables?: string[] | null
          notes?: string | null
          parent_id?: string | null
          pillar?: string | null
          preferred_windows?: Json | null
          priority?: string | null
          sort_order?: number | null
          status?: string | null
          time_commitment_mins?: number | null
          title: string
          total_completed_minutes?: number | null
          updated_at?: string | null
          user_id: string
          weekly_target_minutes?: number | null
        }
        Update: {
          ai_routine?: Json | null
          ai_strategy?: Json | null
          category?: string
          constraints?: Json | null
          created_at?: string | null
          current_streak_days?: number | null
          cycle_end_date?: string | null
          cycle_start_date?: string | null
          days_per_week?: number | null
          description?: string | null
          energy?: string | null
          energy_demand?: string | null
          id?: string
          importance?: string | null
          is_paused?: boolean | null
          level?: number | null
          longest_streak_days?: number | null
          milestone_progress?: number | null
          minutes_per_day?: number | null
          non_negotiables?: string[] | null
          notes?: string | null
          parent_id?: string | null
          pillar?: string | null
          preferred_windows?: Json | null
          priority?: string | null
          sort_order?: number | null
          status?: string | null
          time_commitment_mins?: number | null
          title?: string
          total_completed_minutes?: number | null
          updated_at?: string | null
          user_id?: string
          weekly_target_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "goals_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "goals"
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
          action_habit: string | null
          created_at: string | null
          current_streak: number | null
          duration_min: number | null
          enabled: boolean | null
          goal_id: string | null
          grace_days_used: number | null
          id: string
          is_active: boolean | null
          last_completed: string | null
          longest_streak: number | null
          max_grace_days: number | null
          preferred_window: string | null
          total_completions: number | null
          trigger_habit: string | null
          name: string | null
          steps: Json | null
          trigger_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_duration_mins?: number | null
          action_habit?: string | null
          created_at?: string | null
          current_streak?: number | null
          duration_min?: number | null
          enabled?: boolean | null
          goal_id?: string | null
          grace_days_used?: number | null
          id?: string
          is_active?: boolean | null
          last_completed?: string | null
          longest_streak?: number | null
          max_grace_days?: number | null
          preferred_window?: string | null
          total_completions?: number | null
          trigger_habit?: string | null
          name?: string | null
          steps?: Json | null
          trigger_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_duration_mins?: number | null
          action_habit?: string | null
          created_at?: string | null
          current_streak?: number | null
          duration_min?: number | null
          enabled?: boolean | null
          goal_id?: string | null
          grace_days_used?: number | null
          id?: string
          is_active?: boolean | null
          last_completed?: string | null
          longest_streak?: number | null
          max_grace_days?: number | null
          preferred_window?: string | null
          total_completions?: number | null
          trigger_habit?: string | null
          name?: string | null
          steps?: Json | null
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
      inbox_items: {
        Row: {
          created_at: string
          due_date: string | null
          est_min: number | null
          id: string
          importance: number | null
          kind: string | null
          pillar: string | null
          source_dump_id: string | null
          status: string | null
          title: string
          updated_at: string
          urgency: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          due_date?: string | null
          est_min?: number | null
          id?: string
          importance?: number | null
          kind?: string | null
          pillar?: string | null
          source_dump_id?: string | null
          status?: string | null
          title: string
          updated_at?: string
          urgency?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          due_date?: string | null
          est_min?: number | null
          id?: string
          importance?: number | null
          kind?: string | null
          pillar?: string | null
          source_dump_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string
          urgency?: number | null
          user_id?: string
        }
        Relationships: []
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
      personal_rules: {
        Row: {
          applies_to_day: string | null
          applies_to_pillar: string | null
          applies_to_time_range: string | null
          category: string
          created_at: string | null
          id: string
          is_active: boolean
          is_hard_rule: boolean
          rule: string
          source_review_id: string | null
          times_applied: number
          times_violated: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          applies_to_day?: string | null
          applies_to_pillar?: string | null
          applies_to_time_range?: string | null
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_hard_rule?: boolean
          rule: string
          source_review_id?: string | null
          times_applied?: number
          times_violated?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          applies_to_day?: string | null
          applies_to_pillar?: string | null
          applies_to_time_range?: string | null
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_hard_rule?: boolean
          rule?: string
          source_review_id?: string | null
          times_applied?: number
          times_violated?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_rules_source_review_id_fkey"
            columns: ["source_review_id"]
            isOneToOne: false
            referencedRelation: "weekly_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      potential_goals: {
        Row: {
          created_at: string | null
          first_mentioned_at: string | null
          goal_id: string | null
          id: string
          last_mentioned_at: string | null
          mention_count: number
          pillar: string | null
          source_items: Json | null
          status: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_mentioned_at?: string | null
          goal_id?: string | null
          id?: string
          last_mentioned_at?: string | null
          mention_count?: number
          pillar?: string | null
          source_items?: Json | null
          status?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_mentioned_at?: string | null
          goal_id?: string | null
          id?: string
          last_mentioned_at?: string | null
          mention_count?: number
          pillar?: string | null
          source_items?: Json | null
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "potential_goals_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "potential_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_preferences: {
        Row: {
          allergies: Json | null
          allow_weekend_work: boolean
          ask_before_changes: boolean
          buffer_min: number
          calendar_integration_enabled: boolean
          created_at: string
          default_morning_stack_id: string | null
          default_night_stack_id: string | null
          diet_type: string | null
          is_workout_protected: boolean | null
          low_energy_mode: boolean
          max_ai_options: number
          max_daily_load_min: number | null
          meal_windows: Json | null
          meals_per_day: number
          notification_times: Json | null
          notifications_enabled: boolean
          overwhelm_mode: boolean
          pillar_spacing_preference: string
          preferred_windows: Json | null
          proactive_level: string
          sleep_start: string
          updated_at: string
          user_id: string
          wake_time: string
          weekend_intensity: string
          wind_down_min: number
          morning_routine_min: number
          workout_min_per_day: number | null
          workout_preference: string | null
        }
        Insert: {
          allergies?: Json | null
          allow_weekend_work?: boolean
          ask_before_changes?: boolean
          buffer_min?: number
          calendar_integration_enabled?: boolean
          created_at?: string
          default_morning_stack_id?: string | null
          default_night_stack_id?: string | null
          diet_type?: string | null
          is_workout_protected?: boolean | null
          low_energy_mode?: boolean
          max_ai_options?: number
          max_daily_load_min?: number | null
          meal_windows?: Json | null
          meals_per_day?: number
          notification_times?: Json | null
          notifications_enabled?: boolean
          overwhelm_mode?: boolean
          pillar_spacing_preference?: string
          preferred_windows?: Json | null
          proactive_level?: string
          sleep_start?: string
          updated_at?: string
          user_id: string
          wake_time?: string
          weekend_intensity?: string
          wind_down_min?: number
          morning_routine_min?: number
          workout_min_per_day?: number | null
          workout_preference?: string | null
        }
        Update: {
          allergies?: Json | null
          allow_weekend_work?: boolean
          ask_before_changes?: boolean
          buffer_min?: number
          calendar_integration_enabled?: boolean
          created_at?: string
          default_morning_stack_id?: string | null
          default_night_stack_id?: string | null
          diet_type?: string | null
          is_workout_protected?: boolean | null
          low_energy_mode?: boolean
          max_ai_options?: number
          max_daily_load_min?: number | null
          meal_windows?: Json | null
          meals_per_day?: number
          notification_times?: Json | null
          notifications_enabled?: boolean
          overwhelm_mode?: boolean
          pillar_spacing_preference?: string
          preferred_windows?: Json | null
          proactive_level?: string
          sleep_start?: string
          updated_at?: string
          user_id?: string
          wake_time?: string
          weekend_intensity?: string
          wind_down_min?: number
          morning_routine_min?: number
          workout_min_per_day?: number | null
          workout_preference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_preferences_default_morning_stack_id_fkey"
            columns: ["default_morning_stack_id"]
            isOneToOne: false
            referencedRelation: "habit_stacks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_preferences_default_night_stack_id_fkey"
            columns: ["default_night_stack_id"]
            isOneToOne: false
            referencedRelation: "habit_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_can_analyze: boolean | null
          ai_can_draft: boolean | null
          ai_can_suggest: boolean | null
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
          low_windows: string[] | null
          meal_count: number | null
          meal_duration_minutes: number | null
          meal_preferences: Json | null
          meal_times: Json | null
          meal_windows: Json | null
          meals_per_day: number | null
          onboarding_complete: boolean | null
          peak_windows: string[] | null
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
          wind_down_minutes: number | null
          morning_routine_mins: number | null
          work_style: string | null
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
          low_windows?: string[] | null
          meal_count?: number | null
          meal_duration_minutes?: number | null
          meal_preferences?: Json | null
          meal_times?: Json | null
          meal_windows?: Json | null
          meals_per_day?: number | null
          onboarding_complete?: boolean | null
          peak_windows?: string[] | null
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
          wind_down_minutes?: number | null
          morning_routine_mins?: number | null
          work_style?: string | null
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
          low_windows?: string[] | null
          meal_count?: number | null
          meal_duration_minutes?: number | null
          meal_preferences?: Json | null
          meal_times?: Json | null
          meal_windows?: Json | null
          meals_per_day?: number | null
          onboarding_complete?: boolean | null
          peak_windows?: string[] | null
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
          wind_down_minutes?: number | null
          morning_routine_mins?: number | null
          work_style?: string | null
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
          deviation_reason: string | null
          end_time: string
          energy_cost: string | null
          energy_level_required: number | null
          goal_id: string | null
          habit_stack_id: string | null
          id: string
          is_fixed: boolean | null
          is_locked: boolean | null
          meta: Json | null
          original_date: string | null
          original_start_time: string | null
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
          deviation_reason?: string | null
          end_time: string
          energy_cost?: string | null
          energy_level_required?: number | null
          goal_id?: string | null
          habit_stack_id?: string | null
          id?: string
          is_fixed?: boolean | null
          is_locked?: boolean | null
          meta?: Json | null
          original_date?: string | null
          original_start_time?: string | null
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
          deviation_reason?: string | null
          end_time?: string
          energy_cost?: string | null
          energy_level_required?: number | null
          goal_id?: string | null
          habit_stack_id?: string | null
          id?: string
          is_fixed?: boolean | null
          is_locked?: boolean | null
          meta?: Json | null
          original_date?: string | null
          original_start_time?: string | null
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
          {
            foreignKeyName: "schedule_blocks_habit_stack_id_fkey"
            columns: ["habit_stack_id"]
            isOneToOne: false
            referencedRelation: "habit_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_versions: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          patch_json: Json | null
          reason: string | null
          request_id: string | null
          snapshot: Json
          snapshot_after: Json | null
          snapshot_before: Json | null
          source: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          patch_json?: Json | null
          reason?: string | null
          request_id?: string | null
          snapshot?: Json
          snapshot_after?: Json | null
          snapshot_before?: Json | null
          source: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          patch_json?: Json | null
          reason?: string | null
          request_id?: string | null
          snapshot?: Json
          snapshot_after?: Json | null
          snapshot_before?: Json | null
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
      task_items: {
        Row: {
          created_at: string | null
          est_minutes: number | null
          id: string
          order_index: number | null
          schedule_block_id: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          est_minutes?: number | null
          id?: string
          order_index?: number | null
          schedule_block_id?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          est_minutes?: number | null
          id?: string
          order_index?: number | null
          schedule_block_id?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_items_schedule_block_id_fkey"
            columns: ["schedule_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      user_playbook: {
        Row: {
          category: string
          created_at: string | null
          id: string
          insight: string
          last_surfaced_at: string | null
          pillar: string | null
          source: string
          source_id: string | null
          tags: string[] | null
          times_surfaced: number
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          insight: string
          last_surfaced_at?: string | null
          pillar?: string | null
          source?: string
          source_id?: string | null
          tags?: string[] | null
          times_surfaced?: number
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          insight?: string
          last_surfaced_at?: string | null
          pillar?: string | null
          source?: string
          source_id?: string | null
          tags?: string[] | null
          times_surfaced?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_playbook_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_state: {
        Row: {
          emotional_state: Json | null
          energy_level: number | null
          last_dump_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          emotional_state?: Json | null
          energy_level?: number | null
          last_dump_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          emotional_state?: Json | null
          energy_level?: number | null
          last_dump_at?: string | null
          updated_at?: string
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
      weekly_review_data: {
        Row: {
          associated_block_id: string | null
          associated_goal_id: string | null
          content: string
          created_at: string | null
          data_type: string
          id: string
          source: string
          source_id: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          associated_block_id?: string | null
          associated_goal_id?: string | null
          content: string
          created_at?: string | null
          data_type: string
          id?: string
          source?: string
          source_id?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          associated_block_id?: string | null
          associated_goal_id?: string | null
          content?: string
          created_at?: string | null
          data_type?: string
          id?: string
          source?: string
          source_id?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_review_data_associated_block_id_fkey"
            columns: ["associated_block_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_data_associated_goal_id_fkey"
            columns: ["associated_goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_review_data_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          ai_patterns: Json | null
          ai_suggestions: Json | null
          body_completion_percent: number | null
          challenges: string | null
          changes_for_next_week: string | null
          completed_at: string | null
          completed_blocks: number
          completion_by_day: Json | null
          completion_percent: number
          craft_completion_percent: number | null
          created_at: string | null
          duration_seconds: number | null
          energy_factors: string[] | null
          id: string
          mind_completion_percent: number | null
          overall_energy: string | null
          saved_rules: Json | null
          schedule_changes_applied: Json | null
          skipped_blocks: number
          total_blocks: number
          user_id: string
          week_end: string
          week_start: string
          what_worked: string | null
        }
        Insert: {
          ai_patterns?: Json | null
          ai_suggestions?: Json | null
          body_completion_percent?: number | null
          challenges?: string | null
          changes_for_next_week?: string | null
          completed_at?: string | null
          completed_blocks?: number
          completion_by_day?: Json | null
          completion_percent?: number
          craft_completion_percent?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          energy_factors?: string[] | null
          id?: string
          mind_completion_percent?: number | null
          overall_energy?: string | null
          saved_rules?: Json | null
          schedule_changes_applied?: Json | null
          skipped_blocks?: number
          total_blocks?: number
          user_id: string
          week_end: string
          week_start: string
          what_worked?: string | null
        }
        Update: {
          ai_patterns?: Json | null
          ai_suggestions?: Json | null
          body_completion_percent?: number | null
          challenges?: string | null
          changes_for_next_week?: string | null
          completed_at?: string | null
          completed_blocks?: number
          completion_by_day?: Json | null
          completion_percent?: number
          craft_completion_percent?: number | null
          created_at?: string | null
          duration_seconds?: number | null
          energy_factors?: string[] | null
          id?: string
          mind_completion_percent?: number | null
          overall_energy?: string | null
          saved_rules?: Json | null
          schedule_changes_applied?: Json | null
          skipped_blocks?: number
          total_blocks?: number
          user_id?: string
          week_end?: string
          week_start?: string
          what_worked?: string | null
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

// Missing Exports for Easy Importing
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ScheduleBlock = Database['public']['Tables']['schedule_blocks']['Row'];
export type Goal = Database['public']['Tables']['goals']['Row'];
export type Commitment = Database['public']['Tables']['commitments']['Row'];
export type HabitStack = Database['public']['Tables']['habit_stacks']['Row'];
export type BlockStatus = 'pending' | 'in_progress' | 'done' | 'missed' | 'cancelled' | 'skipped';
