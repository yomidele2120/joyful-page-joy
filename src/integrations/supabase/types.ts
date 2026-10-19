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
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
          is_visible: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          is_visible?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          is_visible?: boolean
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
      orders: {
        Row: {
          created_at: string
          email: string | null
          id: string
          notes: string | null
          phone: string | null
          shipping_address: string | null
          shipping_city: string | null
          shipping_state: string | null
          status: string
          total: number
          updated_at: string
          user_id: string | null
          bnpl_fee: number
          is_preorder: boolean
          payment_method: string
          terms_accepted_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_state?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id?: string | null
          bnpl_fee?: number
          is_preorder?: boolean
          payment_method?: string
          terms_accepted_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          shipping_address?: string | null
          shipping_city?: string | null
          shipping_state?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id?: string | null
          bnpl_fee?: number
          is_preorder?: boolean
          payment_method?: string
          terms_accepted_at?: string | null
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
          payment_method: string | null
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
          payment_method?: string | null
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
          payment_method?: string | null
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
          moq: number
          name: string
          price: number
          price_tiers: Json
          sku: string | null
          slug: string
          specs: Json
          stock_quantity: number
          unit: string
          updated_at: string
          vendor_id: string | null
          video_url: string | null
          is_preorder: boolean
          preorder_approved: boolean
          preorder_status: string
          preorder_release_date: string | null
          preorder_delivery_estimate: string | null
          preorder_quantity_limit: number | null
          preorder_max_per_order: number | null
          preorder_terms: string | null
          preorder_due_notified: boolean
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
          moq?: number
          name: string
          price: number
          price_tiers?: Json
          sku?: string | null
          slug: string
          specs?: Json
          stock_quantity?: number
          unit?: string
          updated_at?: string
          vendor_id?: string | null
          video_url?: string | null
          is_preorder?: boolean
          preorder_approved?: boolean
          preorder_status?: string
          preorder_release_date?: string | null
          preorder_delivery_estimate?: string | null
          preorder_quantity_limit?: number | null
          preorder_max_per_order?: number | null
          preorder_terms?: string | null
          preorder_due_notified?: boolean
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
          moq?: number
          name?: string
          price?: number
          price_tiers?: Json
          sku?: string | null
          slug?: string
          specs?: Json
          stock_quantity?: number
          unit?: string
          updated_at?: string
          vendor_id?: string | null
          video_url?: string | null
          is_preorder?: boolean
          preorder_approved?: boolean
          preorder_status?: string
          preorder_release_date?: string | null
          preorder_delivery_estimate?: string | null
          preorder_quantity_limit?: number | null
          preorder_max_per_order?: number | null
          preorder_terms?: string | null
          preorder_due_notified?: boolean
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
      admin_overview: {
        Args: { _days?: number }
        Returns: Json
      }
      admin_supplier_scorecard: {
        Args: { _days?: number; _ship_sla_hours?: number }
        Returns: Json
      }
      admin_funnel_losses: {
        Args: { _days?: number }
        Returns: Json
      }
      admin_search_insights: {
        Args: { _days?: number }
        Returns: Json
      }
      analytics_summary: {
        Args: { _days?: number }
        Returns: Json
      }
      purge_analytics: {
        Args: { _keep_days?: number }
        Returns: number
      }
      create_order: {
        Args: {
          _address: string
          _city: string
          _email: string
          _items: Json
          _payment_method?: string
          _accepted_terms?: boolean
          _phone: string
          _state: string
        }
        Returns: Json
      }
      get_preorder_taken: {
        Args: { _product_ids: string[] }
        Returns: { product_id: string; taken: number }[]
      }
      get_my_bnpl_status: {
        Args: { _order_ids: string[] }
        Returns: { order_id: string; status: string; amount: number; updated_at: string }[]
      }
      notify_preorders_due: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      get_public_finance_settings: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
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
      tier_price: {
        Args: { _product_id: string; _qty: number }
        Returns: number
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
