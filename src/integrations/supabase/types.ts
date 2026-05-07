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
      addresses: {
        Row: {
          city: string | null
          complement: string | null
          customer_id: string | null
          id: string
          is_default: boolean
          label: string | null
          lat: number | null
          lng: number | null
          neighborhood: string | null
          number: string | null
          region_id: string | null
          state: string | null
          street: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          complement?: string | null
          customer_id?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          number?: string | null
          region_id?: string | null
          state?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          complement?: string | null
          customer_id?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          neighborhood?: string | null
          number?: string | null
          region_id?: string | null
          state?: string | null
          street?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          delivery_id: string | null
          id: string
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          delivery_id?: string | null
          id?: string
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          phone: string | null
          region_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          phone?: string | null
          region_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          phone?: string | null
          region_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          cpf: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          user_id: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          accepted_at: string | null
          address: string
          cancelled_at: string | null
          collected_at: string | null
          commission: number
          company_id: string | null
          completed_at: string | null
          created_at: string
          customer_name: string
          customer_phone: string | null
          driver_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          notes: string | null
          region_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
          value: number
        }
        Insert: {
          accepted_at?: string | null
          address: string
          cancelled_at?: string | null
          collected_at?: string | null
          commission?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name: string
          customer_phone?: string | null
          driver_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          region_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          value?: number
        }
        Update: {
          accepted_at?: string | null
          address?: string
          cancelled_at?: string | null
          collected_at?: string | null
          commission?: number
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string
          customer_phone?: string | null
          driver_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          region_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_drivers: {
        Row: {
          commission_rate: number
          created_at: string
          id: string
          is_online: boolean
          latitude: number | null
          license_plate: string | null
          longitude: number | null
          online: boolean
          rating: number | null
          region_id: string | null
          updated_at: string
          user_id: string
          vehicle: string | null
          vehicle_plate: string | null
          vehicle_type: string | null
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          id?: string
          is_online?: boolean
          latitude?: number | null
          license_plate?: string | null
          longitude?: number | null
          online?: boolean
          rating?: number | null
          region_id?: string | null
          updated_at?: string
          user_id: string
          vehicle?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Update: {
          commission_rate?: number
          created_at?: string
          id?: string
          is_online?: boolean
          latitude?: number | null
          license_plate?: string | null
          longitude?: number | null
          online?: boolean
          rating?: number | null
          region_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle?: string | null
          vehicle_plate?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_drivers_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_invites: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string | null
          id: string
          region_id: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          region_id?: string | null
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          region_id?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_invites_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      occurrences: {
        Row: {
          created_at: string
          delivery_id: string | null
          description: string
          driver_id: string
          id: string
          photo_url: string | null
          status: string
          type: Database["public"]["Enums"]["occurrence_type"]
        }
        Insert: {
          created_at?: string
          delivery_id?: string | null
          description: string
          driver_id: string
          id?: string
          photo_url?: string | null
          status?: string
          type: Database["public"]["Enums"]["occurrence_type"]
        }
        Update: {
          created_at?: string
          delivery_id?: string | null
          description?: string
          driver_id?: string
          id?: string
          photo_url?: string | null
          status?: string
          type?: Database["public"]["Enums"]["occurrence_type"]
        }
        Relationships: [
          {
            foreignKeyName: "occurrences_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occurrences_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          company_id: string | null
          created_at: string
          customer_id: string | null
          delivery_id: string | null
          id: string
          status: string
          total: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_id?: string | null
          id?: string
          status?: string
          total?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string
          customer_id?: string | null
          delivery_id?: string | null
          id?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      regions: {
        Row: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          state: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          state: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          state?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          delivery_id: string | null
          driver_id: string | null
          id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          delivery_id?: string | null
          driver_id?: string | null
          id?: string
          rating: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          delivery_id?: string | null
          driver_id?: string | null
          id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "reviews_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "delivery_drivers"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "company" | "driver" | "customer"
      delivery_status:
        | "pending"
        | "broadcasted"
        | "accepted"
        | "collecting"
        | "in_transit"
        | "delivered"
        | "cancelled"
        | "returned"
      occurrence_type: "motorcycle_issue" | "accident" | "robbery" | "other"
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
      app_role: ["admin", "company", "driver", "customer"],
      delivery_status: [
        "pending",
        "broadcasted",
        "accepted",
        "collecting",
        "in_transit",
        "delivered",
        "cancelled",
        "returned",
      ],
      occurrence_type: ["motorcycle_issue", "accident", "robbery", "other"],
    },
  },
} as const
