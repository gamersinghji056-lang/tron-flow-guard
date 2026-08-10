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
      admin_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      api_idempotency: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          id: string
          idempotency_key: string
          response: Json
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          id?: string
          idempotency_key: string
          response?: Json
          status_code?: number
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          idempotency_key?: string
          response?: Json
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_idempotency_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_id: string
          last_used_at: string | null
          name: string
          permissions: string[]
          request_count: number
          revoked_at: string | null
          secret_hash: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_id: string
          last_used_at?: string | null
          name: string
          permissions?: string[]
          request_count?: number
          revoked_at?: string | null
          secret_hash: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_id?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[]
          request_count?: number
          revoked_at?: string | null
          secret_hash?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_nonces: {
        Row: {
          api_key_id: string | null
          created_at: string
          nonce: string
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          nonce: string
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          nonce?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_nonces_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          ip: string | null
          key_id: string | null
          method: string
          path: string
          request_id: string | null
          status_code: number
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          ip?: string | null
          key_id?: string | null
          method: string
          path: string
          request_id?: string | null
          status_code: number
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          ip?: string | null
          key_id?: string | null
          method?: string
          path?: string
          request_id?: string | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
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
          credited_wallet_id: string | null
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
          credited_wallet_id?: string | null
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
          credited_wallet_id?: string | null
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
            foreignKeyName: "deposit_requests_credited_wallet_id_fkey"
            columns: ["credited_wallet_id"]
            isOneToOne: false
            referencedRelation: "user_wallets"
            referencedColumns: ["id"]
          },
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
      service_health: {
        Row: {
          detail: string | null
          last_error: string | null
          last_error_at: string | null
          last_ok_at: string | null
          latest_block: number | null
          metadata: Json
          service: string
          status: string
          updated_at: string
        }
        Insert: {
          detail?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          latest_block?: number | null
          metadata?: Json
          service: string
          status?: string
          updated_at?: string
        }
        Update: {
          detail?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          latest_block?: number | null
          metadata?: Json
          service?: string
          status?: string
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
      user_wallets: {
        Row: {
          address: string
          balance: number
          created_at: string
          derivation_index: number
          id: string
          is_archived: boolean
          is_default: boolean
          last_synced_at: string | null
          name: string
          network: Database["public"]["Enums"]["chain_network"]
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          balance?: number
          created_at?: string
          derivation_index?: number
          id?: string
          is_archived?: boolean
          is_default?: boolean
          last_synced_at?: string | null
          name: string
          network?: Database["public"]["Enums"]["chain_network"]
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          balance?: number
          created_at?: string
          derivation_index?: number
          id?: string
          is_archived?: boolean
          is_default?: boolean
          last_synced_at?: string | null
          name?: string
          network?: Database["public"]["Enums"]["chain_network"]
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          block_number: number | null
          counterparty_address: string | null
          counterparty_wallet_id: string | null
          created_at: string
          deposit_request_id: string | null
          direction: Database["public"]["Enums"]["wallet_tx_direction"]
          failure_reason: string | null
          fee: number
          id: string
          kind: Database["public"]["Enums"]["wallet_tx_kind"]
          memo: string | null
          network: Database["public"]["Enums"]["chain_network"]
          onchain: boolean
          status: Database["public"]["Enums"]["wallet_tx_status"]
          txid: string | null
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          block_number?: number | null
          counterparty_address?: string | null
          counterparty_wallet_id?: string | null
          created_at?: string
          deposit_request_id?: string | null
          direction: Database["public"]["Enums"]["wallet_tx_direction"]
          failure_reason?: string | null
          fee?: number
          id?: string
          kind?: Database["public"]["Enums"]["wallet_tx_kind"]
          memo?: string | null
          network?: Database["public"]["Enums"]["chain_network"]
          onchain?: boolean
          status?: Database["public"]["Enums"]["wallet_tx_status"]
          txid?: string | null
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          block_number?: number | null
          counterparty_address?: string | null
          counterparty_wallet_id?: string | null
          created_at?: string
          deposit_request_id?: string | null
          direction?: Database["public"]["Enums"]["wallet_tx_direction"]
          failure_reason?: string | null
          fee?: number
          id?: string
          kind?: Database["public"]["Enums"]["wallet_tx_kind"]
          memo?: string | null
          network?: Database["public"]["Enums"]["chain_network"]
          onchain?: boolean
          status?: Database["public"]["Enums"]["wallet_tx_status"]
          txid?: string | null
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_counterparty_wallet_id_fkey"
            columns: ["counterparty_wallet_id"]
            isOneToOne: false
            referencedRelation: "user_wallets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_deposit_request_id_fkey"
            columns: ["deposit_request_id"]
            isOneToOne: false
            referencedRelation: "deposit_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "user_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          address: string
          assigned_user_id: string | null
          created_at: string
          expiry_minutes: number
          id: string
          is_active: boolean
          is_default: boolean
          label: string | null
          max_deposit: number
          min_deposit: number
          name: string
          network: Database["public"]["Enums"]["chain_network"]
          notes: string | null
          updated_at: string
          wallet_kind: Database["public"]["Enums"]["wallet_kind"]
        }
        Insert: {
          address: string
          assigned_user_id?: string | null
          created_at?: string
          expiry_minutes?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string | null
          max_deposit?: number
          min_deposit?: number
          name: string
          network?: Database["public"]["Enums"]["chain_network"]
          notes?: string | null
          updated_at?: string
          wallet_kind?: Database["public"]["Enums"]["wallet_kind"]
        }
        Update: {
          address?: string
          assigned_user_id?: string | null
          created_at?: string
          expiry_minutes?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string | null
          max_deposit?: number
          min_deposit?: number
          name?: string
          network?: Database["public"]["Enums"]["chain_network"]
          notes?: string | null
          updated_at?: string
          wallet_kind?: Database["public"]["Enums"]["wallet_kind"]
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event: string
          event_key: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload: Json
          response_status: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event: string
          event_key: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event?: string
          event_key?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload?: Json
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          events: string[]
          failure_count: number
          id: string
          last_delivery_at: string | null
          last_error: string | null
          secret: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          failure_count?: number
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          secret: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          events?: string[]
          failure_count?: number
          id?: string
          last_delivery_at?: string | null
          last_error?: string | null
          secret?: string
          status?: string
          updated_at?: string
          url?: string
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
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      wallet_transfer: {
        Args: {
          _amount: number
          _from_wallet: string
          _memo?: string
          _to_address: string
        }
        Returns: {
          fee: number
          internal: boolean
          out_tx_id: string
          total: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "trader" | "super_admin"
      chain_network: "trc20-mainnet" | "trc20-nile"
      deposit_status:
        | "waiting"
        | "detected"
        | "confirming"
        | "confirmed"
        | "failed"
        | "expired"
      wallet_kind: "deposit" | "hot" | "cold" | "fee"
      wallet_tx_direction: "in" | "out"
      wallet_tx_kind: "deposit" | "transfer" | "fee" | "adjustment"
      wallet_tx_status: "pending" | "broadcasting" | "completed" | "failed"
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
      app_role: ["admin", "trader", "super_admin"],
      chain_network: ["trc20-mainnet", "trc20-nile"],
      deposit_status: [
        "waiting",
        "detected",
        "confirming",
        "confirmed",
        "failed",
        "expired",
      ],
      wallet_kind: ["deposit", "hot", "cold", "fee"],
      wallet_tx_direction: ["in", "out"],
      wallet_tx_kind: ["deposit", "transfer", "fee", "adjustment"],
      wallet_tx_status: ["pending", "broadcasting", "completed", "failed"],
    },
  },
} as const
