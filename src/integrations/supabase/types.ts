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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      blockchain_events: {
        Row: {
          amount: number | null
          block_number: number | null
          block_timestamp: string | null
          created_at: string
          id: string
          matched: boolean
          network: Database["public"]["Enums"]["chain_network"]
          raw: Json
          token_contract: string | null
          txid: string
          wallet_address: string
        }
        Insert: {
          amount?: number | null
          block_number?: number | null
          block_timestamp?: string | null
          created_at?: string
          id?: string
          matched?: boolean
          network: Database["public"]["Enums"]["chain_network"]
          raw?: Json
          token_contract?: string | null
          txid: string
          wallet_address: string
        }
        Update: {
          amount?: number | null
          block_number?: number | null
          block_timestamp?: string | null
          created_at?: string
          id?: string
          matched?: boolean
          network?: Database["public"]["Enums"]["chain_network"]
          raw?: Json
          token_contract?: string | null
          txid?: string
          wallet_address?: string
        }
        Relationships: []
      }
      deposit_requests: {
        Row: {
          block_number: number | null
          confirmations: number
          confirmed_at: string | null
          created_at: string
          credited: boolean
          detected_at: string | null
          expected_amount: number
          expires_at: string
          failure_reason: string | null
          id: string
          network: Database["public"]["Enums"]["chain_network"]
          order_ref: string
          received_amount: number | null
          required_confirmations: number
          sender_address: string | null
          status: Database["public"]["Enums"]["deposit_status"]
          txid: string | null
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          block_number?: number | null
          confirmations?: number
          confirmed_at?: string | null
          created_at?: string
          credited?: boolean
          detected_at?: string | null
          expected_amount: number
          expires_at?: string
          failure_reason?: string | null
          id?: string
          network: Database["public"]["Enums"]["chain_network"]
          order_ref?: string
          received_amount?: number | null
          required_confirmations?: number
          sender_address?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          txid?: string | null
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          block_number?: number | null
          confirmations?: number
          confirmed_at?: string | null
          created_at?: string
          credited?: boolean
          detected_at?: string | null
          expected_amount?: number
          expires_at?: string
          failure_reason?: string | null
          id?: string
          network?: Database["public"]["Enums"]["chain_network"]
          order_ref?: string
          received_amount?: number | null
          required_confirmations?: number
          sender_address?: string | null
          status?: Database["public"]["Enums"]["deposit_status"]
          txid?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_requests_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      listener_logs: {
        Row: {
          created_at: string
          deposits_updated: number
          duration_ms: number | null
          events_seen: number
          id: string
          latest_block: number | null
          level: string
          message: string
          metadata: Json
          network: Database["public"]["Enums"]["chain_network"] | null
          scope: string
        }
        Insert: {
          created_at?: string
          deposits_updated?: number
          duration_ms?: number | null
          events_seen?: number
          id?: string
          latest_block?: number | null
          level?: string
          message: string
          metadata?: Json
          network?: Database["public"]["Enums"]["chain_network"] | null
          scope?: string
        }
        Update: {
          created_at?: string
          deposits_updated?: number
          duration_ms?: number | null
          events_seen?: number
          id?: string
          latest_block?: number | null
          level?: string
          message?: string
          metadata?: Json
          network?: Database["public"]["Enums"]["chain_network"] | null
          scope?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          deposit_request_id: string | null
          id: string
          read_at: string | null
          severity: string
          title: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          deposit_request_id?: string | null
          id?: string
          read_at?: string | null
          severity?: string
          title: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          deposit_request_id?: string | null
          id?: string
          read_at?: string | null
          severity?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_deposit_request_id_fkey"
            columns: ["deposit_request_id"]
            isOneToOne: false
            referencedRelation: "deposit_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          balance: number
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          block_number: number | null
          block_timestamp: string | null
          chain_status: string | null
          confirmations: number
          created_at: string
          deposit_request_id: string | null
          id: string
          network: Database["public"]["Enums"]["chain_network"]
          processed: boolean
          receiver_address: string
          sender_address: string | null
          token_contract: string
          token_symbol: string
          txid: string
          updated_at: string
          user_id: string | null
          verification_error: string | null
          verified: boolean
        }
        Insert: {
          amount: number
          block_number?: number | null
          block_timestamp?: string | null
          chain_status?: string | null
          confirmations?: number
          created_at?: string
          deposit_request_id?: string | null
          id?: string
          network: Database["public"]["Enums"]["chain_network"]
          processed?: boolean
          receiver_address: string
          sender_address?: string | null
          token_contract: string
          token_symbol?: string
          txid: string
          updated_at?: string
          user_id?: string | null
          verification_error?: string | null
          verified?: boolean
        }
        Update: {
          amount?: number
          block_number?: number | null
          block_timestamp?: string | null
          chain_status?: string | null
          confirmations?: number
          created_at?: string
          deposit_request_id?: string | null
          id?: string
          network?: Database["public"]["Enums"]["chain_network"]
          processed?: boolean
          receiver_address?: string
          sender_address?: string | null
          token_contract?: string
          token_symbol?: string
          txid?: string
          updated_at?: string
          user_id?: string | null
          verification_error?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "transactions_deposit_request_id_fkey"
            columns: ["deposit_request_id"]
            isOneToOne: false
            referencedRelation: "deposit_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          label: string | null
          name: string
          network: Database["public"]["Enums"]["chain_network"]
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string | null
          name: string
          network?: Database["public"]["Enums"]["chain_network"]
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string | null
          name?: string
          network?: Database["public"]["Enums"]["chain_network"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_deposit: {
        Args: { _deposit_id: string }
        Returns: {
          amount: number
          credited: boolean
          user_id: string
        }[]
      }
      expire_stale_deposits: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "trader"
      chain_network: "trc20-mainnet" | "trc20-nile"
      deposit_status:
        | "waiting"
        | "detected"
        | "confirming"
        | "confirmed"
        | "failed"
        | "expired"
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
      app_role: ["admin", "trader"],
      chain_network: ["trc20-mainnet", "trc20-nile"],
      deposit_status: [
        "waiting",
        "detected",
        "confirming",
        "confirmed",
        "failed",
        "expired",
      ],
    },
  },
} as const
