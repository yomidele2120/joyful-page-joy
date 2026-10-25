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
  public: {
    Tables: {
      analytics_events: {
        Row: {
          campaign: string | null
          created_at: string
          device: string | null
          event: string
          id: string
          label: string | null
          order_id: string | null
          path: string | null
          product_id: string | null
          referrer_host: string | null
          search_term: string | null
          session_id: string
          source: string | null
          value: number | null
          visitor_id: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          device?: string | null
          event: string
          id?: string
          label?: string | null
          order_id?: string | null
          path?: string | null
          product_id?: string | null
          referrer_host?: string | null
          search_term?: string | null
          session_id: string
          source?: string | null
          value?: number | null
          visitor_id: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          device?: string | null
          event?: string
          id?: string
          label?: string | null
          order_id?: string | null
          path?: string | null
          product_id?: string | null
          referrer_host?: string | null
          search_term?: string | null
          session_id?: string
          source?: string | null
          value?: number | null
          visitor_id?: string
        }
        Relationships: []
      }
      bnpl_transactions: {
        Row: {
          amount: number
          created_at: string
          fee_charged: number | null
          id: string
          is_live: boolean | null
          order_id: string
          provider: string
          provider_reference: string | null
          raw_verify: Json | null
          reference: string
          settled_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fee_charged?: number | null
          id?: string
          is_live?: boolean | null
          order_id: string
          provider?: string
          provider_reference?: string | null
          raw_verify?: Json | null
          reference: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_charged?: number | null
          id?: string
          is_live?: boolean | null
          order_id?: string
          provider?: string
          provider_reference?: string | null
          raw_verify?: Json | null
          reference?: string
          settled_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bnpl_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      bnpl_webhook_events: {
        Row: {
          event: string | null
          received_at: string
          webhook_id: string
        }
        Insert: {
          event?: string | null
          received_at?: string
          webhook_id: string
        }
        Update: {
          event?: string | null
          received_at?: string
          webhook_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          entity: string
          entity_id: string | null
          id: number
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          entity: string
          entity_id?: string | null
          id?: never
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          participant_1: string
          participant_2: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          participant_1: string
          participant_2: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          participant_1?: string
          participant_2?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_order_amount: number | null
          used_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          used_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_amount?: number | null
          used_count?: number | null
        }
        Relationships: []
      }
      disputes: {
        Row: {
          buyer_id: string
          created_at: string
          desired_outcome: string
          details: string
          id: string
          order_id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          seller_response: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          desired_outcome?: string
          details: string
          id?: string
          order_id: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          seller_response?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          desired_outcome?: string
          details?: string
          id?: string
          order_id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          seller_response?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          bnpl_down_payment_percent: number
          bnpl_enabled: boolean
          bnpl_fee_bearer: string
          bnpl_fee_percent: number
          bnpl_max_order: number
          bnpl_max_outstanding_per_customer: number
          bnpl_min_order: number
          default_commission_percent: number
          delivery_confirm_days: number
          free_period_months: number
          id: boolean
          min_payout_amount: number
          payout_hold_days: number
          updated_at: string
        }
        Insert: {
          bnpl_down_payment_percent?: number
          bnpl_enabled?: boolean
          bnpl_fee_bearer?: string
          bnpl_fee_percent?: number
          bnpl_max_order?: number
          bnpl_max_outstanding_per_customer?: number
          bnpl_min_order?: number
          default_commission_percent?: number
          delivery_confirm_days?: number
          free_period_months?: number
          id?: boolean
          min_payout_amount?: number
          payout_hold_days?: number
          updated_at?: string
        }
        Update: {
          bnpl_down_payment_percent?: number
          bnpl_enabled?: boolean
          bnpl_fee_bearer?: string
          bnpl_fee_percent?: number
          bnpl_max_order?: number
          bnpl_max_outstanding_per_customer?: number
          bnpl_min_order?: number
          default_commission_percent?: number
          delivery_confirm_days?: number
          free_period_months?: number
          id?: boolean
          min_payout_amount?: number
          payout_hold_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      flyers: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          mobile_image_url: string | null
          placement: string
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          mobile_image_url?: string | null
          placement: string
          sort_order?: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          mobile_image_url?: string | null
          placement?: string
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      inquiries: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          message: string
          product_id: string | null
          quantity: number
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          message: string
          product_id?: string | null
          quantity?: number
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          message?: string
          product_id?: string | null
          quantity?: number
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inquiries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inquiries_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_settings: {
        Row: {
          bnpl_section_visible: boolean
          id: boolean
          preorder_delay_cancel_days: number
          preorder_enabled: boolean
          preorder_requires_approval: boolean
          updated_at: string
        }
        Insert: {
          bnpl_section_visible?: boolean
          id?: boolean
          preorder_delay_cancel_days?: number
          preorder_enabled?: boolean
          preorder_requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          bnpl_section_visible?: boolean
          id?: boolean
          preorder_delay_cancel_days?: number
          preorder_enabled?: boolean
          preorder_requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      product_import_jobs: {
        Row: {
          admin_user_id: string | null
          created_at: string
          error_message: string | null
          failed_count: number
          file_name: string
          id: string
          processed_rows: number
          skipped_count: number
          source_type: string
          status: string
          success_count: number
          total_rows: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          file_name: string
          id?: string
          processed_rows?: number
          skipped_count?: number
          source_type?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          error_message?: string | null
          failed_count?: number
          file_name?: string
          id?: string
          processed_rows?: number
          skipped_count?: number
          source_type?: string
          status?: string
          success_count?: number
          total_rows?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_import_jobs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_items: {
        Row: {
          attempt_count: number
          brand: string | null
          category_name: string | null
          created_at: string
          description: string | null
          error_message: string | null
          id: string
          image_status: string
          image_url: string | null
          job_id: string
          normalized_name: string | null
          original_price: number
          price: number
          published_product_id: string | null
          raw_data: Json
          review_notes: string | null
          source_name: string
          source_price: number | null
          source_fields: Json
          source_urls: Json
          specs: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          brand?: string | null
          category_name?: string | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          id?: string
          image_status?: string
          image_url?: string | null
          job_id: string
          normalized_name?: string | null
          original_price: number
          price: number
          published_product_id?: string | null
          raw_data?: Json
          review_notes?: string | null
          source_name: string
          source_price?: number | null
          source_fields?: Json
          source_urls?: Json
          specs?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          brand?: string | null
          category_name?: string | null
          created_at?: string
          description?: string | null
          error_message?: string | null
          id?: string
          image_status?: string
          image_url?: string | null
          job_id?: string
          normalized_name?: string | null
          original_price?: number
          price?: number
          published_product_id?: string | null
          raw_data?: Json
          review_notes?: string | null
          source_name?: string
          source_price?: number | null
          source_fields?: Json
          source_urls?: Json
          specs?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_import_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "product_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_items_published_product_id_fkey"
            columns: ["published_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean | null
          media_type: string | null
          media_url: string | null
          product_id: string | null
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          media_type?: string | null
          media_url?: string | null
          product_id?: string | null
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          media_type?: string | null
          media_url?: string | null
          product_id?: string | null
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          post_id: string | null
          recipient_id: string
          type: string
          vendor_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          post_id?: string | null
          recipient_id: string
          type: string
          vendor_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          post_id?: string | null
          recipient_id?: string
          type?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_payables: {
        Row: {
          bnpl_fee_share: number
          commission_amount: number
          commission_percent: number
          created_at: string
          gross_amount: number
          order_id: string
          order_item_id: string
          payout_id: string | null
          payout_status: string
          vendor_id: string
          vendor_net: number
        }
        Insert: {
          bnpl_fee_share?: number
          commission_amount: number
          commission_percent: number
          created_at?: string
          gross_amount: number
          order_id: string
          order_item_id: string
          payout_id?: string | null
          payout_status?: string
          vendor_id: string
          vendor_net: number
        }
        Update: {
          bnpl_fee_share?: number
          commission_amount?: number
          commission_percent?: number
          created_at?: string
          gross_amount?: number
          order_id?: string
          order_item_id?: string
          payout_id?: string | null
          payout_status?: string
          vendor_id?: string
          vendor_net?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_payables_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_payables_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_payables_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_payables_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          price: number
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          price: number
          product_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          kind: string
          order_id: string
          reason: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          kind: string
          order_id: string
          reason: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          kind?: string
          order_id?: string
          reason?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_shipments: {
        Row: {
          confirmed_by: string | null
          courier: string | null
          created_at: string
          delivered_at: string | null
          dispute_reason: string | null
          disputed_at: string | null
          id: string
          order_id: string
          resolution_note: string | null
          resolved_at: string | null
          shipped_at: string | null
          status: string
          vendor_id: string
          waybill: string | null
        }
        Insert: {
          confirmed_by?: string | null
          courier?: string | null
          created_at?: string
          delivered_at?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          id?: string
          order_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          shipped_at?: string | null
          status?: string
          vendor_id: string
          waybill?: string | null
        }
        Update: {
          confirmed_by?: string | null
          courier?: string | null
          created_at?: string
          delivered_at?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          id?: string
          order_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          shipped_at?: string | null
          status?: string
          vendor_id?: string
          waybill?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_shipments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          bnpl_fee: number
          created_at: string
          delivered_at: string | null
          email: string | null
          expires_at: string | null
          id: string
          is_preorder: boolean
          notes: string | null
          payment_method: string
          phone: string | null
          settled_at: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_fee: number
          shipping_state: string | null
          status: string
          stock_reserved: boolean
          terms_accepted_at: string | null
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bnpl_fee?: number
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          is_preorder?: boolean
          notes?: string | null
          payment_method?: string
          phone?: string | null
          settled_at?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_fee?: number
          shipping_state?: string | null
          status?: string
          stock_reserved?: boolean
          terms_accepted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bnpl_fee?: number
          created_at?: string
          delivered_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          is_preorder?: boolean
          notes?: string | null
          payment_method?: string
          phone?: string | null
          settled_at?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_fee?: number
          shipping_state?: string | null
          status?: string
          stock_reserved?: boolean
          terms_accepted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          id: string
          metadata: Json | null
          order_id: string
          paid_at: string | null
          payment_method: string | null
          paystack_fee: number | null
          paystack_reference: string | null
          status: string
          transaction_reference: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json | null
          order_id: string
          paid_at?: string | null
          payment_method?: string | null
          paystack_fee?: number | null
          paystack_reference?: string | null
          status?: string
          transaction_reference?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string
          paid_at?: string | null
          payment_method?: string | null
          paystack_fee?: number | null
          paystack_reference?: string | null
          status?: string
          transaction_reference?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          id: string
          paid_at: string | null
          paystack_transfer_code: string | null
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          paystack_transfer_code?: string | null
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          paid_at?: string | null
          paystack_transfer_code?: string | null
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          comments_count: number
          created_at: string
          hashtags: string[]
          hls_url: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          likes_count: number
          media_type: string
          product_id: string | null
          stream_uid: string | null
          thumbnail_url: string | null
          updated_at: string
          vendor_id: string
          video_url: string | null
          views_count: number
        }
        Insert: {
          caption?: string | null
          comments_count?: number
          created_at?: string
          hashtags?: string[]
          hls_url?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          likes_count?: number
          media_type?: string
          product_id?: string | null
          stream_uid?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          vendor_id: string
          video_url?: string | null
          views_count?: number
        }
        Update: {
          caption?: string | null
          comments_count?: number
          created_at?: string
          hashtags?: string[]
          hls_url?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          likes_count?: number
          media_type?: string
          product_id?: string | null
          stream_uid?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          vendor_id?: string
          video_url?: string | null
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          badge: string | null
          bnpl_eligible: boolean
          brand: string | null
          category_id: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          images: string[] | null
          is_active: boolean | null
          is_featured: boolean | null
          is_preorder: boolean
          is_public: boolean | null
          moq: number
          name: string
          preorder_approved: boolean
          preorder_delivery_estimate: string | null
          preorder_due_notified: boolean
          preorder_max_per_order: number | null
          preorder_quantity_limit: number | null
          preorder_release_date: string | null
          preorder_status: string
          preorder_terms: string | null
          price: number
          price_max: number | null
          price_min: number | null
          price_tiers: Json
          search_vector: unknown
          sku: string | null
          slug: string
          specs: Json
          stock_quantity: number
          thumb_url: string | null
          unit: string
          updated_at: string
          vendor_id: string | null
          video_url: string | null
        }
        Insert: {
          badge?: string | null
          bnpl_eligible?: boolean
          brand?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_preorder?: boolean
          is_public?: boolean | null
          moq?: number
          name: string
          preorder_approved?: boolean
          preorder_delivery_estimate?: string | null
          preorder_due_notified?: boolean
          preorder_max_per_order?: number | null
          preorder_quantity_limit?: number | null
          preorder_release_date?: string | null
          preorder_status?: string
          preorder_terms?: string | null
          price: number
          price_max?: number | null
          price_min?: number | null
          price_tiers?: Json
          search_vector?: unknown
          sku?: string | null
          slug: string
          specs?: Json
          stock_quantity?: number
          thumb_url?: string | null
          unit?: string
          updated_at?: string
          vendor_id?: string | null
          video_url?: string | null
        }
        Update: {
          badge?: string | null
          bnpl_eligible?: boolean
          brand?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_preorder?: boolean
          is_public?: boolean | null
          moq?: number
          name?: string
          preorder_approved?: boolean
          preorder_delivery_estimate?: string | null
          preorder_due_notified?: boolean
          preorder_max_per_order?: number | null
          preorder_quantity_limit?: number | null
          preorder_release_date?: string | null
          preorder_status?: string
          preorder_terms?: string | null
          price?: number
          price_max?: number | null
          price_min?: number | null
          price_tiers?: Json
          search_vector?: unknown
          sku?: string | null
          slug?: string
          specs?: Json
          stock_quantity?: number
          thumb_url?: string | null
          unit?: string
          updated_at?: string
          vendor_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          mobile_image_url: string | null
          placement: string
          sort_order: number
          starts_at: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          mobile_image_url?: string | null
          placement?: string
          sort_order?: number
          starts_at?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          mobile_image_url?: string | null
          placement?: string
          sort_order?: number
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          id: string
          order_id: string
          paystack_refund_id: string | null
          processed_at: string | null
          reason: string
          status: string
          vendor_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          order_id: string
          paystack_refund_id?: string | null
          processed_at?: string | null
          reason: string
          status?: string
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          order_id?: string
          paystack_refund_id?: string | null
          processed_at?: string | null
          reason?: string
          status?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_quotes: {
        Row: {
          created_at: string
          id: string
          lead_time: string | null
          message: string | null
          moq: number | null
          rfq_id: string
          unit_price: number
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_time?: string | null
          message?: string | null
          moq?: number | null
          rfq_id: string
          unit_price: number
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_time?: string | null
          message?: string | null
          moq?: number | null
          rfq_id?: string
          unit_price?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          buyer_id: string
          category_id: string | null
          created_at: string
          description: string
          destination: string | null
          expires_at: string
          id: string
          quantity: number
          status: string
          target_price: number | null
          title: string
          unit: string
        }
        Insert: {
          buyer_id: string
          category_id?: string | null
          created_at?: string
          description: string
          destination?: string | null
          expires_at?: string
          id?: string
          quantity: number
          status?: string
          target_price?: number | null
          title: string
          unit?: string
        }
        Update: {
          buyer_id?: string
          category_id?: string | null
          created_at?: string
          description?: string
          destination?: string | null
          expires_at?: string
          id?: string
          quantity?: number
          status?: string
          target_price?: number | null
          title?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      supplier_adjustments: {
        Row: {
          amount: number
          applied_payout_id: string | null
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          reason: string
          vendor_id: string
        }
        Insert: {
          amount: number
          applied_payout_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          reason: string
          vendor_id: string
        }
        Update: {
          amount?: number
          applied_payout_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          reason?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_adjustments_applied_payout_id_fkey"
            columns: ["applied_payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_adjustments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_agreements: {
        Row: {
          accepted_at: string
          commission_percent: number
          free_period_months: number
          id: string
          terms_body: string
          terms_version: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          accepted_at?: string
          commission_percent: number
          free_period_months: number
          id?: string
          terms_body: string
          terms_version: string
          user_id: string
          vendor_id: string
        }
        Update: {
          accepted_at?: string
          commission_percent?: number
          free_period_months?: number
          id?: string
          terms_body?: string
          terms_version?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_agreements_terms_version_fkey"
            columns: ["terms_version"]
            isOneToOne: false
            referencedRelation: "supplier_terms_versions"
            referencedColumns: ["version"]
          },
          {
            foreignKeyName: "supplier_agreements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_commercial_terms: {
        Row: {
          activated_at: string | null
          commission_free_until: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          activated_at?: string | null
          commission_free_until?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          activated_at?: string | null
          commission_free_until?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_commercial_terms_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_terms_versions: {
        Row: {
          body: string
          is_current: boolean
          published_at: string
          published_by: string | null
          title: string
          version: string
        }
        Insert: {
          body: string
          is_current?: boolean
          published_at?: string
          published_by?: string | null
          title: string
          version: string
        }
        Update: {
          body?: string
          is_current?: boolean
          published_at?: string
          published_by?: string | null
          title?: string
          version?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_reply: string | null
          category: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          order_id: string | null
          product_id: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
          vendor_id: string | null
        }
        Insert: {
          admin_reply?: string | null
          category?: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          order_id?: string | null
          product_id?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id?: string | null
          vendor_id?: string | null
        }
        Update: {
          admin_reply?: string | null
          category?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          order_id?: string | null
          product_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_private: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          created_at: string
          transfer_recipient_code: string | null
          transfer_recipient_fingerprint: string | null
          updated_at: string
          user_id: string
          vendor_id: string
          verification_document_path: string | null
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          transfer_recipient_code?: string | null
          transfer_recipient_fingerprint?: string | null
          updated_at?: string
          user_id: string
          vendor_id: string
          verification_document_path?: string | null
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          created_at?: string
          transfer_recipient_code?: string | null
          transfer_recipient_fingerprint?: string | null
          updated_at?: string
          user_id?: string
          vendor_id?: string
          verification_document_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_private_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewer_name: string
          updated_at: string
          vendor_id: string
          verified_purchase: boolean
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewer_name?: string
          updated_at?: string
          vendor_id: string
          verified_purchase?: boolean
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewer_name?: string
          updated_at?: string
          vendor_id?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          business_type: string | null
          commission_percent: number | null
          company_name: string | null
          created_at: string
          id: string
          is_approved: boolean | null
          location: string | null
          logo_url: string | null
          paystack_subaccount_code: string | null
          phone: string | null
          product_categories: string[] | null
          store_description: string | null
          store_name: string
          updated_at: string
          user_id: string
          whatsapp_number: string | null
          year_established: number | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          commission_percent?: number | null
          company_name?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean | null
          location?: string | null
          logo_url?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          product_categories?: string[] | null
          store_description?: string | null
          store_name: string
          updated_at?: string
          user_id: string
          whatsapp_number?: string | null
          year_established?: number | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          commission_percent?: number | null
          company_name?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean | null
          location?: string | null
          logo_url?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          product_categories?: string[] | null
          store_description?: string | null
          store_name?: string
          updated_at?: string
          user_id?: string
          whatsapp_number?: string | null
          year_established?: number | null
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vendor_rating_stats: {
        Row: {
          average_rating: number | null
          review_count: number | null
          vendor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_supplier_terms: {
        Args: { _accepted: boolean; _terms_version: string }
        Returns: undefined
      }
      admin_funnel_losses: { Args: { _days?: number }; Returns: Json }
      admin_overview: { Args: { _days?: number }; Returns: Json }
      admin_platform_earnings: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_resolve_dispute: {
        Args: {
          _note?: string
          _order_id: string
          _resolution: string
          _vendor_id: string
        }
        Returns: string
      }
      admin_search_insights: { Args: { _days?: number }; Returns: Json }
      admin_set_refund_status: {
        Args: { _note?: string; _refund_id: string; _status: string }
        Returns: undefined
      }
      admin_supplier_commission_overview: { Args: never; Returns: Json }
      admin_supplier_scorecard: {
        Args: { _days?: number; _ship_sla_hours?: number }
        Returns: Json
      }
      admin_vendor_transactions: {
        Args: { _limit?: number; _vendor_id: string }
        Returns: Json
      }
      am_i_super_admin: { Args: never; Returns: boolean }
      analytics_summary: { Args: { _days?: number }; Returns: Json }
      buyer_confirm_receipt: {
        Args: { _order_id: string; _vendor_id: string }
        Returns: undefined
      }
      buyer_open_dispute: {
        Args: { _order_id: string; _reason: string; _vendor_id: string }
        Returns: undefined
      }
      claim_vendor_payout: {
        Args: { _vendor_id: string }
        Returns: {
          amount: number
          payout_id: string
        }[]
      }
      confirm_bnpl_payment: {
        Args: {
          _is_live: boolean
          _order_id: string
          _provider_reference: string
          _raw: Json
        }
        Returns: string
      }
      create_order:
        | {
            Args: {
              _address: string
              _city: string
              _email: string
              _items: Json
              _phone: string
              _state: string
            }
            Returns: Json
          }
        | {
            Args: {
              _address: string
              _city: string
              _email: string
              _items: Json
              _payment_method?: string
              _phone: string
              _state: string
            }
            Returns: Json
          }
        | {
            Args: {
              _accepted_terms?: boolean
              _address: string
              _city: string
              _email: string
              _items: Json
              _payment_method?: string
              _phone: string
              _state: string
            }
            Returns: Json
          }
      expire_unpaid_orders: { Args: never; Returns: number }
      finance_payables_summary: {
        Args: never
        Returns: {
          adjustments: number
          available: number
          commission_percent: number
          has_bank: boolean
          held: number
          is_approved: boolean
          paid: number
          processing: number
          recipient_ready: boolean
          store_name: string
          vendor_id: string
        }[]
      }
      finish_payout: {
        Args: {
          _outcome: string
          _payout_id: string
          _reason?: string
          _transfer_code?: string
        }
        Returns: string
      }
      get_current_supplier_terms: { Args: never; Returns: Json }
      get_my_bnpl_status: {
        Args: { _order_ids: string[] }
        Returns: {
          amount: number
          order_id: string
          status: string
          updated_at: string
        }[]
      }
      get_preorder_taken: {
        Args: { _product_ids: string[] }
        Returns: {
          product_id: string
          taken: number
        }[]
      }
      get_public_finance_settings: { Args: never; Returns: Json }
      get_ranked_feed: {
        Args: { page_limit: number; page_offset: number }
        Returns: {
          caption: string | null
          comments_count: number
          created_at: string
          hashtags: string[]
          hls_url: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          likes_count: number
          media_type: string
          product_id: string | null
          stream_uid: string | null
          thumbnail_url: string | null
          updated_at: string
          vendor_id: string
          video_url: string | null
          views_count: number
        }[]
        SetofOptions: {
          from: "*"
          to: "posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role:
        | {
            Args: { _role: Database["public"]["Enums"]["app_role"] }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      increment_post_views: {
        Args: { post_id_input: string }
        Returns: undefined
      }
      is_super_admin: { Args: { _uid: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _entity: string
          _entity_id: string
          _new: Json
          _old: Json
        }
        Returns: undefined
      }
      mark_bnpl_settled: {
        Args: { _fee_charged?: number; _order_id: string }
        Returns: undefined
      }
      mark_order_paid: {
        Args: { _method?: string; _order_id: string }
        Returns: string
      }
      my_commission_status: { Args: never; Returns: Json }
      notify_preorders_due: { Args: never; Returns: number }
      notify_user: {
        Args: {
          _actor?: string
          _link?: string
          _message: string
          _recipient: string
          _type: string
          _vendor?: string
        }
        Returns: undefined
      }
      publish_supplier_terms: {
        Args: { _body: string; _title: string; _version: string }
        Returns: undefined
      }
      purge_analytics: { Args: { _keep_days?: number }; Returns: number }
      register_supplier: {
        Args: { _accepted: boolean; _payload: Json; _terms_version: string }
        Returns: string
      }
      release_matured_payables: { Args: never; Returns: number }
      render_supplier_terms: {
        Args: { _body: string; _months: number; _percent: number }
        Returns: string
      }
      set_commission_settings: {
        Args: { _default_percent: number; _free_months: number }
        Returns: undefined
      }
      set_product_thumbnails: { Args: { _rows: Json }; Returns: number }
      set_super_admin: {
        Args: { _on: boolean; _user_id: string }
        Returns: undefined
      }
      tier_price: {
        Args: { _product_id: string; _qty: number }
        Returns: number
      }
      vendor_commission_rate: {
        Args: { _at?: string; _vendor: string }
        Returns: number
      }
      vendor_mark_shipped: {
        Args: { _courier: string; _order_id: string; _waybill: string }
        Returns: undefined
      }
      vendor_order_list: { Args: never; Returns: Json }
      vendor_product_counts: {
        Args: { _vendor_ids: string[] }
        Returns: {
          product_count: number
          vendor_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "vendor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user", "vendor"],
    },
  },
} as const
