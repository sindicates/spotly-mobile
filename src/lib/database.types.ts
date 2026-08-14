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
      buildings: {
        Row: {
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          short_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          short_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          short_name?: string | null
        }
        Relationships: []
      }
      check_ins: {
        Row: {
          author_id: string | null
          created_at: string
          id: string
          spot_id: string
          status: Database["public"]["Enums"]["occupancy_status"]
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          id?: string
          spot_id: string
          status: Database["public"]["Enums"]["occupancy_status"]
        }
        Update: {
          author_id?: string | null
          created_at?: string
          id?: string
          spot_id?: string
          status?: Database["public"]["Enums"]["occupancy_status"]
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "public_spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          account_id: string
          created_at: string
          spot_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          spot_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          spot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "public_spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
        }
        Insert: {
          created_at?: string
          id: string
        }
        Update: {
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reporter_id: string | null
          resolved_at: string | null
          review_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          review_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reporter_id?: string | null
          resolved_at?: string | null
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          embedding: string | null
          expand_count: number
          hidden: boolean
          id: string
          spot_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          embedding?: string | null
          expand_count?: number
          hidden?: boolean
          id?: string
          spot_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          embedding?: string | null
          expand_count?: number
          hidden?: boolean
          id?: string
          spot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "public_spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
      spots: {
        Row: {
          amenity_tags: Database["public"]["Enums"]["amenity_tag"][]
          area_name: string
          building_id: string
          category: Database["public"]["Enums"]["spot_category"]
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          amenity_tags?: Database["public"]["Enums"]["amenity_tag"][]
          area_name: string
          building_id: string
          category?: Database["public"]["Enums"]["spot_category"]
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          amenity_tags?: Database["public"]["Enums"]["amenity_tag"][]
          area_name?: string
          building_id?: string
          category?: Database["public"]["Enums"]["spot_category"]
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spots_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_responses: {
        Row: {
          answers: Json
          created_at: string
          user_id: string
        }
        Insert: {
          answers: Json
          created_at?: string
          user_id?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_reviews: {
        Row: {
          body: string | null
          created_at: string | null
          expand_count: number | null
          id: string | null
          is_mine: boolean | null
          spot_id: string | null
          trending_score: number | null
          updated_at: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          expand_count?: number | null
          id?: string | null
          is_mine?: never
          spot_id?: string | null
          trending_score?: never
          updated_at?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          expand_count?: number | null
          id?: string | null
          is_mine?: never
          spot_id?: string | null
          trending_score?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "public_spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
      public_spots: {
        Row: {
          amenity_tags: Database["public"]["Enums"]["amenity_tag"][] | null
          area_name: string | null
          building: string | null
          building_id: string | null
          building_short: string | null
          category: Database["public"]["Enums"]["spot_category"] | null
          created_at: string | null
          id: string | null
          review_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "spots_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      spot_occupancy: {
        Row: {
          reported_at: string | null
          spot_id: string | null
          status: Database["public"]["Enums"]["occupancy_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "public_spots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_spot_id_fkey"
            columns: ["spot_id"]
            isOneToOne: false
            referencedRelation: "spots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      before_user_created_hook: { Args: { event: Json }; Returns: Json }
      create_check_in: {
        Args: {
          p_spot_id: string
          p_status: Database["public"]["Enums"]["occupancy_status"]
        }
        Returns: string
      }
      create_review: {
        Args: { p_body: string; p_embedding?: string; p_spot_id: string }
        Returns: string
      }
      create_spot_with_review: {
        Args: {
          p_amenity_tags?: Database["public"]["Enums"]["amenity_tag"][]
          p_area_name: string
          p_body?: string
          p_building_id: string
          p_embedding?: string
        }
        Returns: {
          review_id: string
          spot_id: string
        }[]
      }
      increment_expand: { Args: { p_review_id: string }; Returns: undefined }
      report_review: {
        Args: { p_reason?: string; p_review_id: string }
        Returns: string
      }
      search_reviews: {
        Args: {
          candidate_pool?: number
          filter_tags?: Database["public"]["Enums"]["amenity_tag"][]
          min_similarity?: number
          query_embedding: string
          result_limit?: number
        }
        Returns: {
          amenity_tags: Database["public"]["Enums"]["amenity_tag"][]
          area_name: string
          body: string
          building: string
          occupancy: Database["public"]["Enums"]["occupancy_status"]
          reported_at: string
          review_count: number
          review_id: string
          similarity: number
          spot_id: string
        }[]
      }
      update_review: {
        Args: { p_body: string; p_embedding?: string; p_review_id: string }
        Returns: string
      }
    }
    Enums: {
      amenity_tag:
        | "outlets"
        | "quiet"
        | "lively"
        | "group_tables"
        | "natural_light"
        | "food_nearby"
        | "whiteboards"
        | "open_late"
      occupancy_status: "empty" | "some_seats" | "packed"
      spot_category: "study" | "dining" | "hangout"
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
      amenity_tag: [
        "outlets",
        "quiet",
        "lively",
        "group_tables",
        "natural_light",
        "food_nearby",
        "whiteboards",
        "open_late",
      ],
      occupancy_status: ["empty", "some_seats", "packed"],
      spot_category: ["study", "dining", "hangout"],
    },
  },
} as const
