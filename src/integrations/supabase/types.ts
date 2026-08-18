export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
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
  public: {
    Tables: {
      admin_permissions: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          permission: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          permission: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          permission?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      api_idempotency: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          endpoint: string;
          id: string;
          idempotency_key: string;
          response: Json;
          status_code: number;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          endpoint: string;
          id?: string;
          idempotency_key: string;
          response?: Json;
          status_code?: number;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          endpoint?: string;
          id?: string;
          idempotency_key?: string;
          response?: Json;
          status_code?: number;
        };
        Relationships: [
          {
            foreignKeyName: "api_idempotency_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          key_id: string;
          last_used_at: string | null;
          name: string;
          permissions: string[];
          request_count: number;
          revoked_at: string | null;
          secret_hash: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_id: string;
          last_used_at?: string | null;
          name: string;
          permissions?: string[];
          request_count?: number;
          revoked_at?: string | null;
          secret_hash: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          key_id?: string;
          last_used_at?: string | null;
          name?: string;
          permissions?: string[];
          request_count?: number;
          revoked_at?: string | null;
          secret_hash?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      api_nonces: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          nonce: string;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          nonce: string;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          nonce?: string;
        };
        Relationships: [
          {
            foreignKeyName: "api_nonces_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      api_request_logs: {
        Row: {
          api_key_id: string | null;
          created_at: string;
          duration_ms: number | null;
          error: string | null;
          id: string;
          ip: string | null;
          key_id: string | null;
          method: string;
          path: string;
          request_id: string | null;
          status_code: number;
        };
        Insert: {
          api_key_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          ip?: string | null;
          key_id?: string | null;
          method: string;
          path: string;
          request_id?: string | null;
          status_code: number;
        };
        Update: {
          api_key_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          ip?: string | null;
          key_id?: string | null;
          method?: string;
          path?: string;
          request_id?: string | null;
          status_code?: number;
        };
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          id: string;
          metadata: Json;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          id?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      blockchain_events: {
        Row: {
          amount: number | null;
          block_number: number | null;
          block_timestamp: string | null;
          created_at: string;
          id: string;
          matched: boolean;
          network: Database["public"]["Enums"]["chain_network"];
          raw: Json;
          token_contract: string | null;
          txid: string;
          wallet_address: string;
        };
        Insert: {
          amount?: number | null;
          block_number?: number | null;
          block_timestamp?: string | null;
          created_at?: string;
          id?: string;
          matched?: boolean;
          network: Database["public"]["Enums"]["chain_network"];
          raw?: Json;
          token_contract?: string | null;
          txid: string;
          wallet_address: string;
        };
        Update: {
          amount?: number | null;
          block_number?: number | null;
          block_timestamp?: string | null;
          created_at?: string;
          id?: string;
          matched?: boolean;
          network?: Database["public"]["Enums"]["chain_network"];
          raw?: Json;
          token_contract?: string | null;
          txid?: string;
          wallet_address?: string;
        };
        Relationships: [];
      };
      deposit_requests: {
        Row: {
          block_number: number | null;
          confirmations: number;
          confirmed_at: string | null;
          created_at: string;
          credited: boolean;
          credited_wallet_id: string | null;
          detected_at: string | null;
          direct_sell_order_id: string | null;
          expected_amount: number;
          expires_at: string;
          failure_reason: string | null;
          id: string;
          network: Database["public"]["Enums"]["chain_network"];
          order_ref: string;
          purpose: string;
          received_amount: number | null;
          required_confirmations: number;
          sender_address: string | null;
          status: Database["public"]["Enums"]["deposit_status"];
          txid: string | null;
          updated_at: string;
          user_id: string;
          wallet_id: string;
        };
        Insert: {
          block_number?: number | null;
          confirmations?: number;
          confirmed_at?: string | null;
          created_at?: string;
          credited?: boolean;
          credited_wallet_id?: string | null;
          detected_at?: string | null;
          direct_sell_order_id?: string | null;
          expected_amount: number;
          expires_at?: string;
          failure_reason?: string | null;
          id?: string;
          network: Database["public"]["Enums"]["chain_network"];
          order_ref?: string;
          purpose?: string;
          received_amount?: number | null;
          required_confirmations?: number;
          sender_address?: string | null;
          status?: Database["public"]["Enums"]["deposit_status"];
          txid?: string | null;
          updated_at?: string;
          user_id: string;
          wallet_id: string;
        };
        Update: {
          block_number?: number | null;
          confirmations?: number;
          confirmed_at?: string | null;
          created_at?: string;
          credited?: boolean;
          credited_wallet_id?: string | null;
          detected_at?: string | null;
          direct_sell_order_id?: string | null;
          expected_amount?: number;
          expires_at?: string;
          failure_reason?: string | null;
          id?: string;
          network?: Database["public"]["Enums"]["chain_network"];
          order_ref?: string;
          purpose?: string;
          received_amount?: number | null;
          required_confirmations?: number;
          sender_address?: string | null;
          status?: Database["public"]["Enums"]["deposit_status"];
          txid?: string | null;
          updated_at?: string;
          user_id?: string;
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deposit_requests_credited_wallet_id_fkey";
            columns: ["credited_wallet_id"];
            isOneToOne: false;
            referencedRelation: "user_wallets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deposit_requests_direct_sell_order_id_fkey";
            columns: ["direct_sell_order_id"];
            isOneToOne: false;
            referencedRelation: "direct_sell_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deposit_requests_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      direct_sell_orders: {
        Row: {
          assigned_company_address: string;
          block_number: number | null;
          completed_at: string | null;
          confirmations: number;
          created_at: string;
          deposit_request_id: string | null;
          expected_inr: number;
          expected_usdt: number;
          expires_at: string;
          failure_reason: string | null;
          id: string;
          locked_rate_inr: number;
          network: Database["public"]["Enums"]["chain_network"];
          order_ref: string;
          payment_assignment: Json;
          payment_method_id: string | null;
          payment_reference: string | null;
          received_usdt: number;
          remaining_usdt: number;
          required_confirmations: number;
          sender_address: string | null;
          status: Database["public"]["Enums"]["direct_sell_status"];
          txid: string | null;
          updated_at: string;
          usdt_confirmed_at: string | null;
          user_id: string;
          wallet_id: string | null;
        };
        Insert: {
          assigned_company_address: string;
          block_number?: number | null;
          completed_at?: string | null;
          confirmations?: number;
          created_at?: string;
          deposit_request_id?: string | null;
          expected_inr: number;
          expected_usdt: number;
          expires_at: string;
          failure_reason?: string | null;
          id?: string;
          locked_rate_inr: number;
          network: Database["public"]["Enums"]["chain_network"];
          order_ref?: string;
          payment_assignment?: Json;
          payment_method_id?: string | null;
          payment_reference?: string | null;
          received_usdt?: number;
          remaining_usdt?: number;
          required_confirmations?: number;
          sender_address?: string | null;
          status?: Database["public"]["Enums"]["direct_sell_status"];
          txid?: string | null;
          updated_at?: string;
          usdt_confirmed_at?: string | null;
          user_id: string;
          wallet_id?: string | null;
        };
        Update: {
          assigned_company_address?: string;
          block_number?: number | null;
          completed_at?: string | null;
          confirmations?: number;
          created_at?: string;
          deposit_request_id?: string | null;
          expected_inr?: number;
          expected_usdt?: number;
          expires_at?: string;
          failure_reason?: string | null;
          id?: string;
          locked_rate_inr?: number;
          network?: Database["public"]["Enums"]["chain_network"];
          order_ref?: string;
          payment_assignment?: Json;
          payment_method_id?: string | null;
          payment_reference?: string | null;
          received_usdt?: number;
          remaining_usdt?: number;
          required_confirmations?: number;
          sender_address?: string | null;
          status?: Database["public"]["Enums"]["direct_sell_status"];
          txid?: string | null;
          updated_at?: string;
          usdt_confirmed_at?: string | null;
          user_id?: string;
          wallet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "direct_sell_orders_deposit_request_id_fkey";
            columns: ["deposit_request_id"];
            isOneToOne: false;
            referencedRelation: "deposit_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "direct_sell_orders_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "direct_sell_orders_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      direct_sell_payment_items: {
        Row: {
          amount_inr: number;
          confirmation_deadline: string | null;
          confirmed_at: string | null;
          created_at: string;
          created_by: string | null;
          direct_sell_order_id: string;
          dispute_reason: string | null;
          disputed_at: string | null;
          id: string;
          proof_path: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          utr_reference: string | null;
        };
        Insert: {
          amount_inr: number;
          confirmation_deadline?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          direct_sell_order_id: string;
          dispute_reason?: string | null;
          disputed_at?: string | null;
          id?: string;
          proof_path?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
          utr_reference?: string | null;
        };
        Update: {
          amount_inr?: number;
          confirmation_deadline?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          direct_sell_order_id?: string;
          dispute_reason?: string | null;
          disputed_at?: string | null;
          id?: string;
          proof_path?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          utr_reference?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "direct_sell_payment_items_direct_sell_order_id_fkey";
            columns: ["direct_sell_order_id"];
            isOneToOne: false;
            referencedRelation: "direct_sell_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          amount: number;
          balance_after: number;
          balance_before: number;
          bucket: string;
          created_at: string;
          currency: string;
          deposit_request_id: string | null;
          entry_type: Database["public"]["Enums"]["ledger_entry_type"];
          id: string;
          memo: string | null;
          order_id: string | null;
          user_id: string;
          wallet_id: string | null;
        };
        Insert: {
          amount: number;
          balance_after?: number;
          balance_before?: number;
          bucket?: string;
          created_at?: string;
          currency?: string;
          deposit_request_id?: string | null;
          entry_type: Database["public"]["Enums"]["ledger_entry_type"];
          id?: string;
          memo?: string | null;
          order_id?: string | null;
          user_id: string;
          wallet_id?: string | null;
        };
        Update: {
          amount?: number;
          balance_after?: number;
          balance_before?: number;
          bucket?: string;
          created_at?: string;
          currency?: string;
          deposit_request_id?: string | null;
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"];
          id?: string;
          memo?: string | null;
          order_id?: string | null;
          user_id?: string;
          wallet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_deposit_request_id_fkey";
            columns: ["deposit_request_id"];
            isOneToOne: false;
            referencedRelation: "deposit_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "p2p_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "user_wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      listener_logs: {
        Row: {
          created_at: string;
          deposits_updated: number;
          duration_ms: number | null;
          events_seen: number;
          id: string;
          latest_block: number | null;
          level: string;
          message: string;
          metadata: Json;
          network: Database["public"]["Enums"]["chain_network"] | null;
          scope: string;
        };
        Insert: {
          created_at?: string;
          deposits_updated?: number;
          duration_ms?: number | null;
          events_seen?: number;
          id?: string;
          latest_block?: number | null;
          level?: string;
          message: string;
          metadata?: Json;
          network?: Database["public"]["Enums"]["chain_network"] | null;
          scope?: string;
        };
        Update: {
          created_at?: string;
          deposits_updated?: number;
          duration_ms?: number | null;
          events_seen?: number;
          id?: string;
          latest_block?: number | null;
          level?: string;
          message?: string;
          metadata?: Json;
          network?: Database["public"]["Enums"]["chain_network"] | null;
          scope?: string;
        };
        Relationships: [];
      };
      listener_state: {
        Row: {
          addresses_monitored: number;
          chain_head_block: number | null;
          consecutive_failures: number;
          created_at: string;
          last_error: string | null;
          last_error_at: string | null;
          last_poll_at: string | null;
          last_processed_block: number;
          last_success_at: string | null;
          network: Database["public"]["Enums"]["chain_network"];
          reconcile_cursor: string | null;
          updated_at: string;
        };
        Insert: {
          addresses_monitored?: number;
          chain_head_block?: number | null;
          consecutive_failures?: number;
          created_at?: string;
          last_error?: string | null;
          last_error_at?: string | null;
          last_poll_at?: string | null;
          last_processed_block?: number;
          last_success_at?: string | null;
          network: Database["public"]["Enums"]["chain_network"];
          reconcile_cursor?: string | null;
          updated_at?: string;
        };
        Update: {
          addresses_monitored?: number;
          chain_head_block?: number | null;
          consecutive_failures?: number;
          created_at?: string;
          last_error?: string | null;
          last_error_at?: string | null;
          last_poll_at?: string | null;
          last_processed_block?: number;
          last_success_at?: string | null;
          network?: Database["public"]["Enums"]["chain_network"];
          reconcile_cursor?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      merchants: {
        Row: {
          completed_orders: number;
          created_at: string;
          display_name: string;
          fee_percent: number;
          id: string;
          max_order_inr: number;
          merchant_code: string;
          min_order_inr: number;
          risk_note: string | null;
          status: Database["public"]["Enums"]["merchant_status"];
          total_orders: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          completed_orders?: number;
          created_at?: string;
          display_name: string;
          fee_percent?: number;
          id?: string;
          max_order_inr?: number;
          merchant_code: string;
          min_order_inr?: number;
          risk_note?: string | null;
          status?: Database["public"]["Enums"]["merchant_status"];
          total_orders?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          completed_orders?: number;
          created_at?: string;
          display_name?: string;
          fee_percent?: number;
          id?: string;
          max_order_inr?: number;
          merchant_code?: string;
          min_order_inr?: number;
          risk_note?: string | null;
          status?: Database["public"]["Enums"]["merchant_status"];
          total_orders?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          audience: string;
          body: string | null;
          created_at: string;
          deposit_request_id: string | null;
          id: string;
          read_at: string | null;
          severity: string;
          title: string;
          user_id: string | null;
        };
        Insert: {
          audience?: string;
          body?: string | null;
          created_at?: string;
          deposit_request_id?: string | null;
          id?: string;
          read_at?: string | null;
          severity?: string;
          title: string;
          user_id?: string | null;
        };
        Update: {
          audience?: string;
          body?: string | null;
          created_at?: string;
          deposit_request_id?: string | null;
          id?: string;
          read_at?: string | null;
          severity?: string;
          title?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_deposit_request_id_fkey";
            columns: ["deposit_request_id"];
            isOneToOne: false;
            referencedRelation: "deposit_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      p2p_advertisements: {
        Row: {
          asset: string;
          available_usdt: number;
          closed_at: string | null;
          created_at: string;
          fee_policy_snapshot: Json;
          fiat: string;
          id: string;
          is_active: boolean;
          max_order_inr: number;
          merchant_id: string;
          min_order_inr: number;
          payment_method_id: string | null;
          payment_methods: string[];
          price_inr: number;
          reserved_usdt: number;
          side: Database["public"]["Enums"]["p2p_side"];
          terms: string | null;
          updated_at: string;
        };
        Insert: {
          asset?: string;
          available_usdt?: number;
          closed_at?: string | null;
          created_at?: string;
          fee_policy_snapshot?: Json;
          fiat?: string;
          id?: string;
          is_active?: boolean;
          max_order_inr?: number;
          merchant_id: string;
          min_order_inr?: number;
          payment_method_id?: string | null;
          payment_methods?: string[];
          price_inr: number;
          reserved_usdt?: number;
          side?: Database["public"]["Enums"]["p2p_side"];
          terms?: string | null;
          updated_at?: string;
        };
        Update: {
          asset?: string;
          available_usdt?: number;
          closed_at?: string | null;
          created_at?: string;
          fee_policy_snapshot?: Json;
          fiat?: string;
          id?: string;
          is_active?: boolean;
          max_order_inr?: number;
          merchant_id?: string;
          min_order_inr?: number;
          payment_method_id?: string | null;
          payment_methods?: string[];
          price_inr?: number;
          reserved_usdt?: number;
          side?: Database["public"]["Enums"]["p2p_side"];
          terms?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "p2p_advertisements_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "p2p_advertisements_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
        ];
      };
      p2p_disputes: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          order_id: string;
          priority: Database["public"]["Enums"]["dispute_priority"];
          raised_by: string | null;
          reason: string;
          resolution: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: Database["public"]["Enums"]["dispute_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          order_id: string;
          priority?: Database["public"]["Enums"]["dispute_priority"];
          raised_by?: string | null;
          reason: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["dispute_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          order_id?: string;
          priority?: Database["public"]["Enums"]["dispute_priority"];
          raised_by?: string | null;
          reason?: string;
          resolution?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: Database["public"]["Enums"]["dispute_status"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "p2p_disputes_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "p2p_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      p2p_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          is_system: boolean;
          order_id: string;
          read_at: string | null;
          sender_id: string | null;
          sender_role: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          order_id: string;
          read_at?: string | null;
          sender_id?: string | null;
          sender_role?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          is_system?: boolean;
          order_id?: string;
          read_at?: string | null;
          sender_id?: string | null;
          sender_role?: string;
        };
        Relationships: [
          {
            foreignKeyName: "p2p_messages_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "p2p_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      p2p_order_events: {
        Row: {
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          from_status: Database["public"]["Enums"]["p2p_order_status"] | null;
          id: string;
          note: string | null;
          order_id: string;
          to_status: Database["public"]["Enums"]["p2p_order_status"] | null;
        };
        Insert: {
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["p2p_order_status"] | null;
          id?: string;
          note?: string | null;
          order_id: string;
          to_status?: Database["public"]["Enums"]["p2p_order_status"] | null;
        };
        Update: {
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          from_status?: Database["public"]["Enums"]["p2p_order_status"] | null;
          id?: string;
          note?: string | null;
          order_id?: string;
          to_status?: Database["public"]["Enums"]["p2p_order_status"] | null;
        };
        Relationships: [
          {
            foreignKeyName: "p2p_order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "p2p_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      p2p_orders: {
        Row: {
          advertisement_id: string | null;
          buyer_fee_usdt: number;
          buyer_user_id: string | null;
          cancel_reason: string | null;
          cancelled_at: string | null;
          completed_at: string | null;
          confirm_deadline: string | null;
          created_at: string;
          disputed_at: string | null;
          escrow_amount_usdt: number | null;
          escrow_locked: boolean;
          escrow_settled: boolean;
          expired_at: string | null;
          fee_usdt: number;
          id: string;
          merchant_id: string | null;
          order_ref: string;
          paid_amount_inr: number | null;
          paid_at: string | null;
          payment_deadline: string | null;
          payment_method: string;
          payment_method_snapshot: Json;
          payment_proof_path: string | null;
          payment_reference: string | null;
          payment_submitted_at: string | null;
          payout_holder_name: string | null;
          payout_upi_id: string | null;
          price_inr: number;
          proof_url: string | null;
          release_idempotency_key: string | null;
          seller_confirmation_deadline: string | null;
          seller_fee_usdt: number;
          seller_id: string;
          side: Database["public"]["Enums"]["p2p_side"];
          status: Database["public"]["Enums"]["p2p_order_status"];
          total_inr: number;
          updated_at: string;
          usdt_amount: number;
          utr_reference: string | null;
        };
        Insert: {
          advertisement_id?: string | null;
          buyer_fee_usdt?: number;
          buyer_user_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirm_deadline?: string | null;
          created_at?: string;
          disputed_at?: string | null;
          escrow_amount_usdt?: number | null;
          escrow_locked?: boolean;
          escrow_settled?: boolean;
          expired_at?: string | null;
          fee_usdt?: number;
          id?: string;
          merchant_id?: string | null;
          order_ref?: string;
          paid_amount_inr?: number | null;
          paid_at?: string | null;
          payment_deadline?: string | null;
          payment_method?: string;
          payment_method_snapshot?: Json;
          payment_proof_path?: string | null;
          payment_reference?: string | null;
          payment_submitted_at?: string | null;
          payout_holder_name?: string | null;
          payout_upi_id?: string | null;
          price_inr: number;
          proof_url?: string | null;
          release_idempotency_key?: string | null;
          seller_confirmation_deadline?: string | null;
          seller_fee_usdt?: number;
          seller_id: string;
          side?: Database["public"]["Enums"]["p2p_side"];
          status?: Database["public"]["Enums"]["p2p_order_status"];
          total_inr: number;
          updated_at?: string;
          usdt_amount: number;
          utr_reference?: string | null;
        };
        Update: {
          advertisement_id?: string | null;
          buyer_fee_usdt?: number;
          buyer_user_id?: string | null;
          cancel_reason?: string | null;
          cancelled_at?: string | null;
          completed_at?: string | null;
          confirm_deadline?: string | null;
          created_at?: string;
          disputed_at?: string | null;
          escrow_amount_usdt?: number | null;
          escrow_locked?: boolean;
          escrow_settled?: boolean;
          expired_at?: string | null;
          fee_usdt?: number;
          id?: string;
          merchant_id?: string | null;
          order_ref?: string;
          paid_amount_inr?: number | null;
          paid_at?: string | null;
          payment_deadline?: string | null;
          payment_method?: string;
          payment_method_snapshot?: Json;
          payment_proof_path?: string | null;
          payment_reference?: string | null;
          payment_submitted_at?: string | null;
          payout_holder_name?: string | null;
          payout_upi_id?: string | null;
          price_inr?: number;
          proof_url?: string | null;
          release_idempotency_key?: string | null;
          seller_confirmation_deadline?: string | null;
          seller_fee_usdt?: number;
          seller_id?: string;
          side?: Database["public"]["Enums"]["p2p_side"];
          status?: Database["public"]["Enums"]["p2p_order_status"];
          total_inr?: number;
          updated_at?: string;
          usdt_amount?: number;
          utr_reference?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "p2p_orders_advertisement_id_fkey";
            columns: ["advertisement_id"];
            isOneToOne: false;
            referencedRelation: "p2p_advertisements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "p2p_orders_merchant_id_fkey";
            columns: ["merchant_id"];
            isOneToOne: false;
            referencedRelation: "merchants";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          account_number: string | null;
          bank_name: string | null;
          created_at: string;
          holder_name: string;
          id: string;
          ifsc: string | null;
          is_default: boolean;
          kind: string;
          label: string | null;
          status: string;
          supported_rails: string[];
          updated_at: string;
          upi_id: string | null;
          user_id: string;
          verified: boolean;
        };
        Insert: {
          account_number?: string | null;
          bank_name?: string | null;
          created_at?: string;
          holder_name: string;
          id?: string;
          ifsc?: string | null;
          is_default?: boolean;
          kind?: string;
          label?: string | null;
          status?: string;
          supported_rails?: string[];
          updated_at?: string;
          upi_id?: string | null;
          user_id: string;
          verified?: boolean;
        };
        Update: {
          account_number?: string | null;
          bank_name?: string | null;
          created_at?: string;
          holder_name?: string;
          id?: string;
          ifsc?: string | null;
          is_default?: boolean;
          kind?: string;
          label?: string | null;
          status?: string;
          supported_rails?: string[];
          updated_at?: string;
          upi_id?: string | null;
          user_id?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      payment_proofs: {
        Row: {
          content_type: string | null;
          created_at: string;
          file_name: string | null;
          id: string;
          order_id: string;
          order_type: string;
          size_bytes: number | null;
          storage_bucket: string;
          storage_path: string;
          user_id: string;
        };
        Insert: {
          content_type?: string | null;
          created_at?: string;
          file_name?: string | null;
          id?: string;
          order_id: string;
          order_type: string;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path: string;
          user_id: string;
        };
        Update: {
          content_type?: string | null;
          created_at?: string;
          file_name?: string | null;
          id?: string;
          order_id?: string;
          order_type?: string;
          size_bytes?: number | null;
          storage_bucket?: string;
          storage_path?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payment_source_reservations: {
        Row: {
          amount_inr: number;
          created_at: string;
          direct_sell_order_id: string;
          expires_at: string;
          id: string;
          payment_reference: string | null;
          source_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_inr: number;
          created_at?: string;
          direct_sell_order_id: string;
          expires_at?: string;
          id?: string;
          payment_reference?: string | null;
          source_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_inr?: number;
          created_at?: string;
          direct_sell_order_id?: string;
          expires_at?: string;
          id?: string;
          payment_reference?: string | null;
          source_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_source_reservations_direct_sell_order_id_fkey";
            columns: ["direct_sell_order_id"];
            isOneToOne: true;
            referencedRelation: "direct_sell_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_source_reservations_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "payment_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_sources: {
        Row: {
          account_ref: string;
          created_at: string;
          daily_limit_inr: number;
          holder_name: string | null;
          id: string;
          is_online: boolean;
          label: string;
          max_inr: number;
          method: string;
          min_inr: number;
          reserved_inr: number;
          risk_state: string;
          sent_today_inr: number;
          status: string;
          success_rate: number;
          updated_at: string;
        };
        Insert: {
          account_ref: string;
          created_at?: string;
          daily_limit_inr?: number;
          holder_name?: string | null;
          id?: string;
          is_online?: boolean;
          label: string;
          max_inr?: number;
          method?: string;
          min_inr?: number;
          reserved_inr?: number;
          risk_state?: string;
          sent_today_inr?: number;
          status?: string;
          success_rate?: number;
          updated_at?: string;
        };
        Update: {
          account_ref?: string;
          created_at?: string;
          daily_limit_inr?: number;
          holder_name?: string | null;
          id?: string;
          is_online?: boolean;
          label?: string;
          max_inr?: number;
          method?: string;
          min_inr?: number;
          reserved_inr?: number;
          risk_state?: string;
          sent_today_inr?: number;
          status?: string;
          success_rate?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      personal_wallet_secrets: {
        Row: {
          auth_tag: string;
          created_at: string;
          derivation_path: string;
          encrypted_mnemonic: string;
          iv: string;
          kdf_salt: string;
          updated_at: string;
          user_id: string;
          wallet_id: string;
        };
        Insert: {
          auth_tag: string;
          created_at?: string;
          derivation_path: string;
          encrypted_mnemonic: string;
          iv: string;
          kdf_salt: string;
          updated_at?: string;
          user_id: string;
          wallet_id: string;
        };
        Update: {
          auth_tag?: string;
          created_at?: string;
          derivation_path?: string;
          encrypted_mnemonic?: string;
          iv?: string;
          kdf_salt?: string;
          updated_at?: string;
          user_id?: string;
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "personal_wallet_secrets_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: true;
            referencedRelation: "user_wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          balance: number;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          locked_balance: number;
          referral_code: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          balance?: number;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          locked_balance?: number;
          referral_code?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          balance?: number;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          locked_balance?: number;
          referral_code?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      referral_attributions: {
        Row: {
          created_at: string;
          id: string;
          qualified_at: string | null;
          referral_code: string;
          referred_user_id: string;
          referrer_user_id: string;
          source: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          qualified_at?: string | null;
          referral_code: string;
          referred_user_id: string;
          referrer_user_id: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          qualified_at?: string | null;
          referral_code?: string;
          referred_user_id?: string;
          referrer_user_id?: string;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      referral_rewards: {
        Row: {
          amount: number;
          attribution_id: string;
          created_at: string;
          currency: string;
          id: string;
          idempotency_key: string;
          ledger_entry_id: string | null;
          paid_at: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          amount?: number;
          attribution_id: string;
          created_at?: string;
          currency?: string;
          id?: string;
          idempotency_key: string;
          ledger_entry_id?: string | null;
          paid_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          attribution_id?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          idempotency_key?: string;
          ledger_entry_id?: string | null;
          paid_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referral_rewards_attribution_id_fkey";
            columns: ["attribution_id"];
            isOneToOne: false;
            referencedRelation: "referral_attributions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referral_rewards_ledger_entry_id_fkey";
            columns: ["ledger_entry_id"];
            isOneToOne: false;
            referencedRelation: "ledger_entries";
            referencedColumns: ["id"];
          },
        ];
      };
      service_health: {
        Row: {
          detail: string | null;
          last_error: string | null;
          last_error_at: string | null;
          last_ok_at: string | null;
          latest_block: number | null;
          metadata: Json;
          service: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          detail?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          last_ok_at?: string | null;
          latest_block?: number | null;
          metadata?: Json;
          service: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          detail?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          last_ok_at?: string | null;
          latest_block?: number | null;
          metadata?: Json;
          service?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      system_settings: {
        Row: {
          description: string | null;
          key: string;
          updated_at: string;
          value: Json;
        };
        Insert: {
          description?: string | null;
          key: string;
          updated_at?: string;
          value: Json;
        };
        Update: {
          description?: string | null;
          key?: string;
          updated_at?: string;
          value?: Json;
        };
        Relationships: [];
      };
      telegram_accounts: {
        Row: {
          chat_id: number;
          created_at: string;
          disabled_at: string | null;
          disabled_reason: string | null;
          first_name: string | null;
          id: string;
          language_code: string | null;
          last_name: string | null;
          last_seen_at: string;
          linked_at: string;
          notifications_enabled: boolean;
          status: Database["public"]["Enums"]["telegram_account_status"];
          telegram_user_id: number;
          updated_at: string;
          user_id: string;
          username: string | null;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          first_name?: string | null;
          id?: string;
          language_code?: string | null;
          last_name?: string | null;
          last_seen_at?: string;
          linked_at?: string;
          notifications_enabled?: boolean;
          status?: Database["public"]["Enums"]["telegram_account_status"];
          telegram_user_id: number;
          updated_at?: string;
          user_id: string;
          username?: string | null;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          disabled_at?: string | null;
          disabled_reason?: string | null;
          first_name?: string | null;
          id?: string;
          language_code?: string | null;
          last_name?: string | null;
          last_seen_at?: string;
          linked_at?: string;
          notifications_enabled?: boolean;
          status?: Database["public"]["Enums"]["telegram_account_status"];
          telegram_user_id?: number;
          updated_at?: string;
          user_id?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      telegram_app_handoffs: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          nonce: string;
          status: string;
          telegram_account_id: string;
          telegram_user_id: number;
          token_hash: string;
          updated_at: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          nonce: string;
          status?: string;
          telegram_account_id: string;
          telegram_user_id: number;
          token_hash: string;
          updated_at?: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          nonce?: string;
          status?: string;
          telegram_account_id?: string;
          telegram_user_id?: number;
          token_hash?: string;
          updated_at?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_app_handoffs_telegram_account_id_fkey";
            columns: ["telegram_account_id"];
            isOneToOne: false;
            referencedRelation: "telegram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_app_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          last_used_at: string | null;
          session_hash: string;
          status: string;
          telegram_account_id: string;
          telegram_user_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          last_used_at?: string | null;
          session_hash: string;
          status?: string;
          telegram_account_id: string;
          telegram_user_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_used_at?: string | null;
          session_hash?: string;
          status?: string;
          telegram_account_id?: string;
          telegram_user_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_app_sessions_telegram_account_id_fkey";
            columns: ["telegram_account_id"];
            isOneToOne: false;
            referencedRelation: "telegram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_bot_auth_states: {
        Row: {
          attempts: number;
          chat_id: number;
          created_at: string;
          email: string | null;
          expires_at: string;
          flow: Database["public"]["Enums"]["telegram_bot_auth_flow"];
          locked_until: string | null;
          step: Database["public"]["Enums"]["telegram_bot_auth_step"];
          telegram_user_id: number;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          chat_id: number;
          created_at?: string;
          email?: string | null;
          expires_at: string;
          flow: Database["public"]["Enums"]["telegram_bot_auth_flow"];
          locked_until?: string | null;
          step: Database["public"]["Enums"]["telegram_bot_auth_step"];
          telegram_user_id: number;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          chat_id?: number;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          flow?: Database["public"]["Enums"]["telegram_bot_auth_flow"];
          locked_until?: string | null;
          step?: Database["public"]["Enums"]["telegram_bot_auth_step"];
          telegram_user_id?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      telegram_bot_health: {
        Row: {
          bot_username: string | null;
          created_at: string;
          detail: string | null;
          last_error: string | null;
          last_error_at: string | null;
          last_ok_at: string | null;
          last_update_id: number | null;
          metadata: Json;
          mini_app_url: string | null;
          service: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          bot_username?: string | null;
          created_at?: string;
          detail?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          last_ok_at?: string | null;
          last_update_id?: number | null;
          metadata?: Json;
          mini_app_url?: string | null;
          service: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          bot_username?: string | null;
          created_at?: string;
          detail?: string | null;
          last_error?: string | null;
          last_error_at?: string | null;
          last_ok_at?: string | null;
          last_update_id?: number | null;
          metadata?: Json;
          mini_app_url?: string | null;
          service?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      telegram_link_audit: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_type: string;
          created_at: string;
          id: string;
          metadata: Json;
          reason: string | null;
          telegram_account_id: string | null;
          telegram_user_id: number | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          reason?: string | null;
          telegram_account_id?: string | null;
          telegram_user_id?: number | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_type?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          reason?: string | null;
          telegram_account_id?: string | null;
          telegram_user_id?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_link_audit_telegram_account_id_fkey";
            columns: ["telegram_account_id"];
            isOneToOne: false;
            referencedRelation: "telegram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      telegram_notification_queue: {
        Row: {
          attempts: number;
          body: string;
          chat_id: number;
          created_at: string;
          event: string;
          id: string;
          last_error: string | null;
          max_attempts: number;
          next_retry_at: string;
          payload: Json;
          sent_at: string | null;
          status: Database["public"]["Enums"]["telegram_queue_status"];
          telegram_account_id: string;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          body: string;
          chat_id: number;
          created_at?: string;
          event: string;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_retry_at?: string;
          payload?: Json;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["telegram_queue_status"];
          telegram_account_id: string;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          body?: string;
          chat_id?: number;
          created_at?: string;
          event?: string;
          id?: string;
          last_error?: string | null;
          max_attempts?: number;
          next_retry_at?: string;
          payload?: Json;
          sent_at?: string | null;
          status?: Database["public"]["Enums"]["telegram_queue_status"];
          telegram_account_id?: string;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "telegram_notification_queue_telegram_account_id_fkey";
            columns: ["telegram_account_id"];
            isOneToOne: false;
            referencedRelation: "telegram_accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      trading_vendors: {
        Row: {
          completed_orders: number;
          created_at: string;
          disputed_orders: number;
          id: string;
          name: string;
          risk_state: string;
          status: string;
          success_rate: number;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          completed_orders?: number;
          created_at?: string;
          disputed_orders?: number;
          id?: string;
          name: string;
          risk_state?: string;
          status?: string;
          success_rate?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          completed_orders?: number;
          created_at?: string;
          disputed_orders?: number;
          id?: string;
          name?: string;
          risk_state?: string;
          status?: string;
          success_rate?: number;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      transaction_passwords: {
        Row: {
          changed_at: string;
          created_at: string;
          failed_attempts: number;
          locked_until: string | null;
          password_hash: string;
          salt: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          changed_at?: string;
          created_at?: string;
          failed_attempts?: number;
          locked_until?: string | null;
          password_hash: string;
          salt: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          changed_at?: string;
          created_at?: string;
          failed_attempts?: number;
          locked_until?: string | null;
          password_hash?: string;
          salt?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          amount: number;
          block_number: number | null;
          block_timestamp: string | null;
          chain_status: string | null;
          confirmations: number;
          created_at: string;
          deposit_request_id: string | null;
          id: string;
          network: Database["public"]["Enums"]["chain_network"];
          processed: boolean;
          receiver_address: string;
          sender_address: string | null;
          token_contract: string;
          token_symbol: string;
          txid: string;
          updated_at: string;
          user_id: string | null;
          verification_error: string | null;
          verified: boolean;
        };
        Insert: {
          amount: number;
          block_number?: number | null;
          block_timestamp?: string | null;
          chain_status?: string | null;
          confirmations?: number;
          created_at?: string;
          deposit_request_id?: string | null;
          id?: string;
          network: Database["public"]["Enums"]["chain_network"];
          processed?: boolean;
          receiver_address: string;
          sender_address?: string | null;
          token_contract: string;
          token_symbol?: string;
          txid: string;
          updated_at?: string;
          user_id?: string | null;
          verification_error?: string | null;
          verified?: boolean;
        };
        Update: {
          amount?: number;
          block_number?: number | null;
          block_timestamp?: string | null;
          chain_status?: string | null;
          confirmations?: number;
          created_at?: string;
          deposit_request_id?: string | null;
          id?: string;
          network?: Database["public"]["Enums"]["chain_network"];
          processed?: boolean;
          receiver_address?: string;
          sender_address?: string | null;
          token_contract?: string;
          token_symbol?: string;
          txid?: string;
          updated_at?: string;
          user_id?: string | null;
          verification_error?: string | null;
          verified?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_deposit_request_id_fkey";
            columns: ["deposit_request_id"];
            isOneToOne: false;
            referencedRelation: "deposit_requests";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      user_wallets: {
        Row: {
          activated_on_chain: boolean;
          address: string;
          backup_confirmed_at: string | null;
          backup_status: string;
          balance: number;
          created_at: string;
          custody: string;
          derivation_index: number;
          derivation_path: string | null;
          first_seen_txid: string | null;
          gas_sponsorship_status: string;
          id: string;
          is_archived: boolean;
          is_default: boolean;
          last_synced_at: string | null;
          monitored: boolean;
          name: string;
          network: Database["public"]["Enums"]["chain_network"];
          onchain_balance: number | null;
          onchain_checked_at: string | null;
          public_key: string | null;
          selected_at: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          wallet_type: string;
        };
        Insert: {
          activated_on_chain?: boolean;
          address: string;
          backup_confirmed_at?: string | null;
          backup_status?: string;
          balance?: number;
          created_at?: string;
          custody?: string;
          derivation_index?: number;
          derivation_path?: string | null;
          first_seen_txid?: string | null;
          gas_sponsorship_status?: string;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          last_synced_at?: string | null;
          monitored?: boolean;
          name: string;
          network?: Database["public"]["Enums"]["chain_network"];
          onchain_balance?: number | null;
          onchain_checked_at?: string | null;
          public_key?: string | null;
          selected_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
          wallet_type?: string;
        };
        Update: {
          activated_on_chain?: boolean;
          address?: string;
          backup_confirmed_at?: string | null;
          backup_status?: string;
          balance?: number;
          created_at?: string;
          custody?: string;
          derivation_index?: number;
          derivation_path?: string | null;
          first_seen_txid?: string | null;
          gas_sponsorship_status?: string;
          id?: string;
          is_archived?: boolean;
          is_default?: boolean;
          last_synced_at?: string | null;
          monitored?: boolean;
          name?: string;
          network?: Database["public"]["Enums"]["chain_network"];
          onchain_balance?: number | null;
          onchain_checked_at?: string | null;
          public_key?: string | null;
          selected_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
          wallet_type?: string;
        };
        Relationships: [];
      };
      vendor_listings: {
        Row: {
          asset: string;
          available_usdt: number;
          created_at: string;
          daily_limit_usdt: number;
          fiat: string;
          id: string;
          max_order_inr: number;
          min_order_inr: number;
          payment_rails: string[];
          rate_inr: number;
          reserved_usdt: number;
          status: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          asset?: string;
          available_usdt?: number;
          created_at?: string;
          daily_limit_usdt?: number;
          fiat?: string;
          id?: string;
          max_order_inr?: number;
          min_order_inr?: number;
          payment_rails?: string[];
          rate_inr: number;
          reserved_usdt?: number;
          status?: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          asset?: string;
          available_usdt?: number;
          created_at?: string;
          daily_limit_usdt?: number;
          fiat?: string;
          id?: string;
          max_order_inr?: number;
          min_order_inr?: number;
          payment_rails?: string[];
          rate_inr?: number;
          reserved_usdt?: number;
          status?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_listings_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "trading_vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_orders: {
        Row: {
          buyer_fee_usdt: number;
          buyer_user_id: string;
          completed_at: string | null;
          created_at: string;
          disputed_at: string | null;
          expired_at: string | null;
          id: string;
          listing_id: string | null;
          order_ref: string;
          paid_amount_inr: number | null;
          payment_account_snapshot: Json;
          payment_deadline: string | null;
          payment_proof_path: string | null;
          payment_rail: string;
          payment_submitted_at: string | null;
          rate_inr: number;
          release_idempotency_key: string | null;
          status: string;
          total_inr: number;
          updated_at: string;
          usdt_amount: number;
          utr_reference: string | null;
          vendor_fee_usdt: number;
          vendor_id: string;
        };
        Insert: {
          buyer_fee_usdt?: number;
          buyer_user_id: string;
          completed_at?: string | null;
          created_at?: string;
          disputed_at?: string | null;
          expired_at?: string | null;
          id?: string;
          listing_id?: string | null;
          order_ref?: string;
          paid_amount_inr?: number | null;
          payment_account_snapshot?: Json;
          payment_deadline?: string | null;
          payment_proof_path?: string | null;
          payment_rail?: string;
          payment_submitted_at?: string | null;
          rate_inr: number;
          release_idempotency_key?: string | null;
          status?: string;
          total_inr: number;
          updated_at?: string;
          usdt_amount: number;
          utr_reference?: string | null;
          vendor_fee_usdt?: number;
          vendor_id: string;
        };
        Update: {
          buyer_fee_usdt?: number;
          buyer_user_id?: string;
          completed_at?: string | null;
          created_at?: string;
          disputed_at?: string | null;
          expired_at?: string | null;
          id?: string;
          listing_id?: string | null;
          order_ref?: string;
          paid_amount_inr?: number | null;
          payment_account_snapshot?: Json;
          payment_deadline?: string | null;
          payment_proof_path?: string | null;
          payment_rail?: string;
          payment_submitted_at?: string | null;
          rate_inr?: number;
          release_idempotency_key?: string | null;
          status?: string;
          total_inr?: number;
          updated_at?: string;
          usdt_amount?: number;
          utr_reference?: string | null;
          vendor_fee_usdt?: number;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_orders_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "vendor_listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendor_orders_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "trading_vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      vendor_payment_accounts: {
        Row: {
          account_ref: string;
          bank_name: string | null;
          created_at: string;
          holder_name: string | null;
          id: string;
          ifsc: string | null;
          is_default: boolean;
          rail: string;
          status: string;
          updated_at: string;
          vendor_id: string;
        };
        Insert: {
          account_ref: string;
          bank_name?: string | null;
          created_at?: string;
          holder_name?: string | null;
          id?: string;
          ifsc?: string | null;
          is_default?: boolean;
          rail: string;
          status?: string;
          updated_at?: string;
          vendor_id: string;
        };
        Update: {
          account_ref?: string;
          bank_name?: string | null;
          created_at?: string;
          holder_name?: string | null;
          id?: string;
          ifsc?: string | null;
          is_default?: boolean;
          rail?: string;
          status?: string;
          updated_at?: string;
          vendor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vendor_payment_accounts_vendor_id_fkey";
            columns: ["vendor_id"];
            isOneToOne: false;
            referencedRelation: "trading_vendors";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_transactions: {
        Row: {
          amount: number;
          balance_after: number | null;
          block_number: number | null;
          counterparty_address: string | null;
          counterparty_wallet_id: string | null;
          created_at: string;
          deposit_request_id: string | null;
          direction: Database["public"]["Enums"]["wallet_tx_direction"];
          failure_reason: string | null;
          fee: number;
          id: string;
          kind: Database["public"]["Enums"]["wallet_tx_kind"];
          memo: string | null;
          network: Database["public"]["Enums"]["chain_network"];
          onchain: boolean;
          status: Database["public"]["Enums"]["wallet_tx_status"];
          txid: string | null;
          updated_at: string;
          user_id: string;
          wallet_id: string;
        };
        Insert: {
          amount: number;
          balance_after?: number | null;
          block_number?: number | null;
          counterparty_address?: string | null;
          counterparty_wallet_id?: string | null;
          created_at?: string;
          deposit_request_id?: string | null;
          direction: Database["public"]["Enums"]["wallet_tx_direction"];
          failure_reason?: string | null;
          fee?: number;
          id?: string;
          kind?: Database["public"]["Enums"]["wallet_tx_kind"];
          memo?: string | null;
          network?: Database["public"]["Enums"]["chain_network"];
          onchain?: boolean;
          status?: Database["public"]["Enums"]["wallet_tx_status"];
          txid?: string | null;
          updated_at?: string;
          user_id: string;
          wallet_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number | null;
          block_number?: number | null;
          counterparty_address?: string | null;
          counterparty_wallet_id?: string | null;
          created_at?: string;
          deposit_request_id?: string | null;
          direction?: Database["public"]["Enums"]["wallet_tx_direction"];
          failure_reason?: string | null;
          fee?: number;
          id?: string;
          kind?: Database["public"]["Enums"]["wallet_tx_kind"];
          memo?: string | null;
          network?: Database["public"]["Enums"]["chain_network"];
          onchain?: boolean;
          status?: Database["public"]["Enums"]["wallet_tx_status"];
          txid?: string | null;
          updated_at?: string;
          user_id?: string;
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_counterparty_wallet_id_fkey";
            columns: ["counterparty_wallet_id"];
            isOneToOne: false;
            referencedRelation: "user_wallets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_transactions_deposit_request_id_fkey";
            columns: ["deposit_request_id"];
            isOneToOne: false;
            referencedRelation: "deposit_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "user_wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      wallets: {
        Row: {
          address: string;
          assigned_user_id: string | null;
          created_at: string;
          expiry_minutes: number;
          id: string;
          is_active: boolean;
          is_default: boolean;
          label: string | null;
          max_deposit: number;
          min_deposit: number;
          name: string;
          network: Database["public"]["Enums"]["chain_network"];
          notes: string | null;
          updated_at: string;
          wallet_kind: Database["public"]["Enums"]["wallet_kind"];
        };
        Insert: {
          address: string;
          assigned_user_id?: string | null;
          created_at?: string;
          expiry_minutes?: number;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          label?: string | null;
          max_deposit?: number;
          min_deposit?: number;
          name: string;
          network?: Database["public"]["Enums"]["chain_network"];
          notes?: string | null;
          updated_at?: string;
          wallet_kind?: Database["public"]["Enums"]["wallet_kind"];
        };
        Update: {
          address?: string;
          assigned_user_id?: string | null;
          created_at?: string;
          expiry_minutes?: number;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          label?: string | null;
          max_deposit?: number;
          min_deposit?: number;
          name?: string;
          network?: Database["public"]["Enums"]["chain_network"];
          notes?: string | null;
          updated_at?: string;
          wallet_kind?: Database["public"]["Enums"]["wallet_kind"];
        };
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          endpoint_id: string;
          event: string;
          event_key: string;
          id: string;
          last_error: string | null;
          next_retry_at: string | null;
          payload: Json;
          response_status: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          endpoint_id: string;
          event: string;
          event_key: string;
          id?: string;
          last_error?: string | null;
          next_retry_at?: string | null;
          payload?: Json;
          response_status?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          endpoint_id?: string;
          event?: string;
          event_key?: string;
          id?: string;
          last_error?: string | null;
          next_retry_at?: string | null;
          payload?: Json;
          response_status?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey";
            columns: ["endpoint_id"];
            isOneToOne: false;
            referencedRelation: "webhook_endpoints";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_endpoints: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          events: string[];
          failure_count: number;
          id: string;
          last_delivery_at: string | null;
          last_error: string | null;
          secret: string;
          status: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          events?: string[];
          failure_count?: number;
          id?: string;
          last_delivery_at?: string | null;
          last_error?: string | null;
          secret: string;
          status?: string;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          events?: string[];
          failure_count?: number;
          id?: string;
          last_delivery_at?: string | null;
          last_error?: string | null;
          secret?: string;
          status?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      withdrawal_requests: {
        Row: {
          amount: number;
          created_at: string;
          failure_reason: string | null;
          fee: number;
          id: string;
          idempotency_key: string | null;
          network: Database["public"]["Enums"]["chain_network"];
          status: Database["public"]["Enums"]["withdrawal_status"];
          to_address: string;
          total_debit: number | null;
          txid: string | null;
          updated_at: string;
          user_id: string;
          wallet_id: string | null;
        };
        Insert: {
          amount: number;
          created_at?: string;
          failure_reason?: string | null;
          fee?: number;
          id?: string;
          idempotency_key?: string | null;
          network: Database["public"]["Enums"]["chain_network"];
          status?: Database["public"]["Enums"]["withdrawal_status"];
          to_address: string;
          total_debit?: number | null;
          txid?: string | null;
          updated_at?: string;
          user_id: string;
          wallet_id?: string | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          failure_reason?: string | null;
          fee?: number;
          id?: string;
          idempotency_key?: string | null;
          network?: Database["public"]["Enums"]["chain_network"];
          status?: Database["public"]["Enums"]["withdrawal_status"];
          to_address?: string;
          total_debit?: number | null;
          txid?: string | null;
          updated_at?: string;
          user_id?: string;
          wallet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "user_wallets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_resolve_dispute: {
        Args: { _action: string; _dispute_id: string; _reason?: string };
        Returns: boolean;
      };
      admin_set_telegram_account_status: {
        Args: {
          _reason?: string;
          _status: Database["public"]["Enums"]["telegram_account_status"];
          _telegram_account_id: string;
        };
        Returns: boolean;
      };
      admin_upsert_trading_vendor: {
        Args: {
          _name: string;
          _risk_state?: string;
          _status?: string;
          _user_id?: string;
          _vendor_id: string;
        };
        Returns: {
          completed_orders: number;
          created_at: string;
          disputed_orders: number;
          id: string;
          name: string;
          risk_state: string;
          status: string;
          success_rate: number;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "trading_vendors";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      admin_upsert_vendor_listing: {
        Args: {
          _available_usdt: number;
          _listing_id: string;
          _max_order_inr: number;
          _min_order_inr: number;
          _payment_rails: string[];
          _rate_inr: number;
          _status?: string;
          _vendor_id: string;
        };
        Returns: {
          asset: string;
          available_usdt: number;
          created_at: string;
          daily_limit_usdt: number;
          fiat: string;
          id: string;
          max_order_inr: number;
          min_order_inr: number;
          payment_rails: string[];
          rate_inr: number;
          reserved_usdt: number;
          status: string;
          updated_at: string;
          vendor_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "vendor_listings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      assign_direct_sell_payment: {
        Args: { _order_id: string };
        Returns: {
          amount_inr: number;
          created_at: string;
          direct_sell_order_id: string;
          expires_at: string;
          id: string;
          payment_reference: string | null;
          source_id: string;
          status: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "payment_source_reservations";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      auto_approve_direct_sell_payment_items: { Args: never; Returns: number };
      auto_release_p2p_orders: { Args: never; Returns: number };
      calculate_p2p_seller_fee: { Args: { _usdt: number }; Returns: number };
      calculate_percent_fee: {
        Args: { _amount: number; _default: number; _setting: string };
        Returns: number;
      };
      complete_direct_sell_order: {
        Args: { _order_id: string };
        Returns: boolean;
      };
      confirm_direct_sell_payment_item: {
        Args: { _item_id: string };
        Returns: boolean;
      };
      confirm_vendor_payment: { Args: { _order_id: string }; Returns: boolean };
      create_direct_sell_order: {
        Args: { _amount: number; _payment_method_id?: string };
        Returns: {
          deposit_request_id: string;
          expected_inr: number;
          order_id: string;
          order_ref: string;
          wallet_address: string;
        }[];
      };
      create_direct_sell_payment_item: {
        Args: {
          _amount_inr: number;
          _order_id: string;
          _proof_path?: string;
          _utr: string;
        };
        Returns: {
          amount_inr: number;
          confirmation_deadline: string | null;
          confirmed_at: string | null;
          created_at: string;
          created_by: string | null;
          direct_sell_order_id: string;
          dispute_reason: string | null;
          disputed_at: string | null;
          id: string;
          proof_path: string | null;
          status: string;
          updated_at: string;
          user_id: string;
          utr_reference: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "direct_sell_payment_items";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_vendor_order: {
        Args: { _listing_id: string; _rail: string; _usdt: number };
        Returns: {
          buyer_fee_usdt: number;
          buyer_user_id: string;
          completed_at: string | null;
          created_at: string;
          disputed_at: string | null;
          expired_at: string | null;
          id: string;
          listing_id: string | null;
          order_ref: string;
          paid_amount_inr: number | null;
          payment_account_snapshot: Json;
          payment_deadline: string | null;
          payment_proof_path: string | null;
          payment_rail: string;
          payment_submitted_at: string | null;
          rate_inr: number;
          release_idempotency_key: string | null;
          status: string;
          total_inr: number;
          updated_at: string;
          usdt_amount: number;
          utr_reference: string | null;
          vendor_fee_usdt: number;
          vendor_id: string;
        };
        SetofOptions: {
          from: "*";
          to: "vendor_orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_withdrawal_request: {
        Args: {
          _amount: number;
          _idempotency_key?: string;
          _to_address: string;
        };
        Returns: {
          amount: number;
          created_at: string;
          failure_reason: string | null;
          fee: number;
          id: string;
          idempotency_key: string | null;
          network: Database["public"]["Enums"]["chain_network"];
          status: Database["public"]["Enums"]["withdrawal_status"];
          to_address: string;
          total_debit: number | null;
          txid: string | null;
          updated_at: string;
          user_id: string;
          wallet_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "withdrawal_requests";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      credit_deposit: {
        Args: { _deposit_id: string };
        Returns: {
          amount: number;
          credited: boolean;
          user_id: string;
        }[];
      };
      credit_wallet_onchain_deposit: {
        Args: {
          _amount: number;
          _block_number: number;
          _from_address: string;
          _network: Database["public"]["Enums"]["chain_network"];
          _txid: string;
          _wallet_id: string;
        };
        Returns: {
          balance_after: number;
          credited: boolean;
        }[];
      };
      dispute_direct_sell_payment_item: {
        Args: { _item_id: string; _reason: string };
        Returns: boolean;
      };
      dispute_vendor_order: {
        Args: { _order_id: string; _reason: string };
        Returns: boolean;
      };
      ensure_user_merchant: {
        Args: { _user_id: string };
        Returns: {
          completed_orders: number;
          created_at: string;
          display_name: string;
          fee_percent: number;
          id: string;
          max_order_inr: number;
          merchant_code: string;
          min_order_inr: number;
          risk_note: string | null;
          status: Database["public"]["Enums"]["merchant_status"];
          total_orders: number;
          updated_at: string;
          user_id: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "merchants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      expire_p2p_orders: { Args: never; Returns: number };
      expire_stale_deposits: { Args: never; Returns: number };
      expire_telegram_app_handoffs: { Args: never; Returns: number };
      expire_telegram_app_sessions: { Args: never; Returns: number };
      expire_telegram_auth_state: { Args: never; Returns: number };
      expire_vendor_orders: { Args: never; Returns: number };
      get_boolean_setting: {
        Args: { _default: boolean; _key: string };
        Returns: boolean;
      };
      get_numeric_setting: {
        Args: { _default: number; _key: string };
        Returns: number;
      };
      has_permission: {
        Args: { _permission: string; _user_id: string };
        Returns: boolean;
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
      mark_direct_sell_payment_sent: {
        Args: { _order_id: string; _reference: string };
        Returns: boolean;
      };
      p2p_cancel_order: {
        Args: { _order_id: string; _reason?: string };
        Returns: boolean;
      };
      p2p_confirm_payment_received: {
        Args: { _order_id: string };
        Returns: {
          fee: number;
          released: number;
        }[];
      };
      p2p_create_ad: {
        Args: {
          _available_usdt: number;
          _is_active?: boolean;
          _max_order_inr: number;
          _min_order_inr: number;
          _payment_method_id?: string;
          _payment_methods?: string[];
          _price: number;
          _side: Database["public"]["Enums"]["p2p_side"];
          _terms?: string;
        };
        Returns: {
          asset: string;
          available_usdt: number;
          closed_at: string | null;
          created_at: string;
          fee_policy_snapshot: Json;
          fiat: string;
          id: string;
          is_active: boolean;
          max_order_inr: number;
          merchant_id: string;
          min_order_inr: number;
          payment_method_id: string | null;
          payment_methods: string[];
          price_inr: number;
          reserved_usdt: number;
          side: Database["public"]["Enums"]["p2p_side"];
          terms: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "p2p_advertisements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      p2p_create_order_from_ad: {
        Args: {
          _advertisement_id: string;
          _payment_method_id?: string;
          _usdt: number;
        };
        Returns: {
          order_id: string;
          order_ref: string;
          total_inr: number;
        }[];
      };
      p2p_create_sell_order: {
        Args: {
          _advertisement_id: string;
          _payment_method_id: string;
          _usdt: number;
        };
        Returns: {
          order_id: string;
          order_ref: string;
          total_inr: number;
        }[];
      };
      p2p_mark_payment_sent: {
        Args: {
          _amount: number;
          _order_id: string;
          _proof_url?: string;
          _utr: string;
        };
        Returns: boolean;
      };
      p2p_raise_dispute: {
        Args: { _details?: string; _order_id: string; _reason: string };
        Returns: string;
      };
      p2p_release_escrow: {
        Args: {
          _actor_id: string;
          _actor_type: string;
          _note: string;
          _order_id: string;
        };
        Returns: {
          buyer_fee: number;
          released: number;
          seller_fee: number;
        }[];
      };
      p2p_send_message: {
        Args: { _body: string; _order_id: string };
        Returns: string;
      };
      p2p_set_ad_active: {
        Args: { _ad_id: string; _is_active: boolean };
        Returns: boolean;
      };
      p2p_update_ad: {
        Args: {
          _ad_id: string;
          _available_usdt: number;
          _is_active?: boolean;
          _max_order_inr: number;
          _min_order_inr: number;
          _payment_method_id?: string;
          _payment_methods?: string[];
          _price: number;
          _terms?: string;
        };
        Returns: {
          asset: string;
          available_usdt: number;
          closed_at: string | null;
          created_at: string;
          fee_policy_snapshot: Json;
          fiat: string;
          id: string;
          is_active: boolean;
          max_order_inr: number;
          merchant_id: string;
          min_order_inr: number;
          payment_method_id: string | null;
          payment_methods: string[];
          price_inr: number;
          reserved_usdt: number;
          side: Database["public"]["Enums"]["p2p_side"];
          terms: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "p2p_advertisements";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      process_order_timers: { Args: never; Returns: Json };
      record_p2p_system_event: {
        Args: {
          _actor: string;
          _from: Database["public"]["Enums"]["p2p_order_status"];
          _note: string;
          _order_id: string;
          _to: Database["public"]["Enums"]["p2p_order_status"];
        };
        Returns: undefined;
      };
      submit_vendor_payment: {
        Args: {
          _amount: number;
          _order_id: string;
          _proof_path?: string;
          _utr: string;
        };
        Returns: boolean;
      };
      wallet_transfer: {
        Args: {
          _amount: number;
          _from_wallet: string;
          _memo?: string;
          _to_address: string;
        };
        Returns: {
          fee: number;
          internal: boolean;
          out_tx_id: string;
          total: number;
        }[];
      };
      write_ledger: {
        Args: {
          _after: number;
          _amount: number;
          _before: number;
          _bucket: string;
          _memo: string;
          _order_id: string;
          _type: Database["public"]["Enums"]["ledger_entry_type"];
          _user_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      app_role: "admin" | "trader" | "super_admin";
      chain_network: "trc20-mainnet" | "trc20-nile";
      deposit_status:
        | "waiting"
        | "detected"
        | "confirming"
        | "confirmed"
        | "failed"
        | "expired"
        | "underpaid"
        | "overpaid"
        | "late_payment"
        | "review"
        | "credited";
      direct_sell_status:
        | "created"
        | "waiting_for_usdt"
        | "usdt_detected"
        | "usdt_confirming"
        | "usdt_confirmed"
        | "funds_locked"
        | "inr_payment_pending"
        | "payment_assigned"
        | "inr_payment_sent"
        | "inr_payment_verifying"
        | "completed"
        | "expired"
        | "partial_payment"
        | "overpayment"
        | "manual_review"
        | "cancelled"
        | "payment_verifying";
      dispute_priority: "low" | "medium" | "high" | "critical";
      dispute_status: "open" | "evidence_requested" | "resolved" | "rejected";
      ledger_entry_type:
        | "deposit"
        | "withdrawal"
        | "p2p_buy"
        | "p2p_sell"
        | "fee"
        | "escrow_lock"
        | "escrow_release"
        | "escrow_refund"
        | "transfer_in"
        | "transfer_out"
        | "adjustment"
        | "deposit_credit"
        | "p2p_escrow_lock"
        | "p2p_escrow_release"
        | "direct_sell"
        | "refund";
      merchant_status: "pending" | "approved" | "suspended";
      p2p_order_status:
        | "created"
        | "escrow_locked"
        | "payment_pending"
        | "payment_sent"
        | "payment_received"
        | "completed"
        | "cancelled"
        | "expired"
        | "disputed"
        | "admin_review"
        | "payment_submitted"
        | "payment_verifying"
        | "release_pending"
        | "refunded";
      p2p_side: "buy" | "sell";
      telegram_account_status: "active" | "disabled" | "unlinked";
      telegram_bot_auth_flow: "login" | "register";
      telegram_bot_auth_step: "email" | "password" | "confirm_password";
      telegram_queue_status: "pending" | "sending" | "sent" | "failed" | "cancelled";
      wallet_kind: "deposit" | "hot" | "cold" | "fee";
      wallet_tx_direction: "in" | "out";
      wallet_tx_kind: "deposit" | "transfer" | "fee" | "adjustment";
      wallet_tx_status: "pending" | "broadcasting" | "completed" | "failed";
      withdrawal_status:
        "pending" | "processing" | "broadcast" | "confirmed" | "failed" | "manual_review";
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
  graphql_public: {
    Enums: {},
  },
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
        "underpaid",
        "overpaid",
        "late_payment",
        "review",
        "credited",
      ],
      direct_sell_status: [
        "created",
        "waiting_for_usdt",
        "usdt_detected",
        "usdt_confirming",
        "usdt_confirmed",
        "funds_locked",
        "inr_payment_pending",
        "payment_assigned",
        "inr_payment_sent",
        "inr_payment_verifying",
        "completed",
        "expired",
        "partial_payment",
        "overpayment",
        "manual_review",
        "cancelled",
        "payment_verifying",
      ],
      dispute_priority: ["low", "medium", "high", "critical"],
      dispute_status: ["open", "evidence_requested", "resolved", "rejected"],
      ledger_entry_type: [
        "deposit",
        "withdrawal",
        "p2p_buy",
        "p2p_sell",
        "fee",
        "escrow_lock",
        "escrow_release",
        "escrow_refund",
        "transfer_in",
        "transfer_out",
        "adjustment",
        "deposit_credit",
        "p2p_escrow_lock",
        "p2p_escrow_release",
        "direct_sell",
        "refund",
      ],
      merchant_status: ["pending", "approved", "suspended"],
      p2p_order_status: [
        "created",
        "escrow_locked",
        "payment_pending",
        "payment_sent",
        "payment_received",
        "completed",
        "cancelled",
        "expired",
        "disputed",
        "admin_review",
        "payment_submitted",
        "payment_verifying",
        "release_pending",
        "refunded",
      ],
      p2p_side: ["buy", "sell"],
      telegram_account_status: ["active", "disabled", "unlinked"],
      telegram_bot_auth_flow: ["login", "register"],
      telegram_bot_auth_step: ["email", "password", "confirm_password"],
      telegram_queue_status: ["pending", "sending", "sent", "failed", "cancelled"],
      wallet_kind: ["deposit", "hot", "cold", "fee"],
      wallet_tx_direction: ["in", "out"],
      wallet_tx_kind: ["deposit", "transfer", "fee", "adjustment"],
      wallet_tx_status: ["pending", "broadcasting", "completed", "failed"],
      withdrawal_status: [
        "pending",
        "processing",
        "broadcast",
        "confirmed",
        "failed",
        "manual_review",
      ],
    },
  },
} as const;
