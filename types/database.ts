/**
 * Supabaseデータベースの型定義
 * 本番ではSupabase CLIの `supabase gen types typescript` で自動生成を推奨
 * TODO: Supabaseプロジェクト作成後、CLI経由で自動生成に切り替える
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          company_id: string | null;
          full_name: string | null;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          company_id?: string | null;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string | null;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
      };
      trading_partners: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          bank_name: string | null;
          branch_name: string | null;
          account_type: string | null;
          /** 口座番号は下4桁のみ保存（セキュリティ要件） */
          account_number_last4: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          bank_name?: string | null;
          branch_name?: string | null;
          account_type?: string | null;
          account_number_last4?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          bank_name?: string | null;
          branch_name?: string | null;
          account_type?: string | null;
          account_number_last4?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      trading_partner_aliases: {
        Row: {
          id: string;
          trading_partner_id: string;
          alias_name: string;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          trading_partner_id: string;
          alias_name: string;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          trading_partner_id?: string;
          alias_name?: string;
          is_primary?: boolean;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_user_company_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
