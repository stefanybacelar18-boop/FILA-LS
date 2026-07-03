export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type UserRole =
  | "motorista"
  | "empilhador"
  | "operador"
  | "supervisor"
  | "administrador";

type QueueStatus =
  | "aguardando_descarregamento"
  | "ausente"
  | "finalizado"
  | "aguardando"
  | "chamado"
  | "em_deslocamento"
  | "em_descarga"
  | "aguardando_carregamento_racks"
  | "cancelado";

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: UserRole;
          cpf: string | null;
          telefone: string | null;
          checkin_liberado: boolean;
          device_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          role?: UserRole;
          cpf?: string | null;
          telefone?: string | null;
          checkin_liberado?: boolean;
          device_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: UserRole;
          cpf?: string | null;
          telefone?: string | null;
          checkin_liberado?: boolean;
          device_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: string;
          key: string;
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      queue_entries: {
        Row: {
          id: string;
          token: string;
          driver_user_id: string | null;
          minuta: string | null;
          nome: string;
          cpf: string;
          telefone: string;
          placa: string;
          placa_cavalo: string | null;
          placa_carreta: string | null;
          placa_segunda_carreta: string | null;
          tipo_veiculo: string | null;
          transportadora: string;
          empresa: string;
          tipo_carga: string;
          retorno_racks_vazios: boolean | null;
          observacoes: string | null;
          status: QueueStatus;
          doca: string | null;
          previsao_descarregamento: string | null;
          posicao_fila: number | null;
          checkin_lat: number | null;
          checkin_lng: number | null;
          device_id: string | null;
          ip_address: string | null;
          user_agent: string | null;
          called_at: string | null;
          started_unload_at: string | null;
          finished_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          token?: string;
          driver_user_id?: string | null;
          minuta?: string | null;
          nome: string;
          cpf: string;
          telefone: string;
          placa: string;
          placa_cavalo?: string | null;
          placa_carreta?: string | null;
          placa_segunda_carreta?: string | null;
          tipo_veiculo?: string | null;
          transportadora: string;
          empresa: string;
          tipo_carga: string;
          retorno_racks_vazios?: boolean | null;
          observacoes?: string | null;
          status?: QueueStatus;
          doca?: string | null;
          previsao_descarregamento?: string | null;
          posicao_fila?: number | null;
          checkin_lat?: number | null;
          checkin_lng?: number | null;
          device_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          called_at?: string | null;
          started_unload_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          token?: string;
          driver_user_id?: string | null;
          minuta?: string | null;
          nome?: string;
          cpf?: string;
          telefone?: string;
          placa?: string;
          placa_cavalo?: string | null;
          placa_carreta?: string | null;
          placa_segunda_carreta?: string | null;
          tipo_veiculo?: string | null;
          transportadora?: string;
          empresa?: string;
          tipo_carga?: string;
          retorno_racks_vazios?: boolean | null;
          observacoes?: string | null;
          status?: QueueStatus;
          doca?: string | null;
          previsao_descarregamento?: string | null;
          posicao_fila?: number | null;
          checkin_lat?: number | null;
          checkin_lng?: number | null;
          device_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          called_at?: string | null;
          started_unload_at?: string | null;
          finished_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      queue_history: {
        Row: {
          id: string;
          queue_entry_id: string;
          old_status: QueueStatus | null;
          new_status: QueueStatus;
          changed_by: string | null;
          changed_by_name: string | null;
          notes: string | null;
          doca: string | null;
          previsao_descarregamento: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          queue_entry_id: string;
          old_status?: QueueStatus | null;
          new_status: QueueStatus;
          changed_by?: string | null;
          changed_by_name?: string | null;
          notes?: string | null;
          doca?: string | null;
          previsao_descarregamento?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          queue_entry_id?: string;
          old_status?: QueueStatus | null;
          new_status?: QueueStatus;
          changed_by?: string | null;
          changed_by_name?: string | null;
          notes?: string | null;
          doca?: string | null;
          previsao_descarregamento?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      checkin_audit_log: {
        Row: {
          id: string;
          driver_user_id: string | null;
          queue_entry_id: string | null;
          action: string;
          device_id: string | null;
          ip_address: string | null;
          user_agent: string | null;
          lat: number | null;
          lng: number | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          driver_user_id?: string | null;
          queue_entry_id?: string | null;
          action: string;
          device_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          lat?: number | null;
          lng?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          driver_user_id?: string | null;
          queue_entry_id?: string | null;
          action?: string;
          device_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          lat?: number | null;
          lng?: number | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_active_queue_summary: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          token: string;
          minuta: string | null;
          placa: string;
          placa_cavalo: string | null;
          status: QueueStatus;
          doca: string | null;
          previsao_descarregamento: string | null;
          posicao_fila: number | null;
          created_at: string;
        }[];
      };
      get_queue_by_token: {
        Args: { p_token: string };
        Returns: {
          id: string;
          token: string;
          minuta: string | null;
          placa: string;
          placa_cavalo: string | null;
          status: QueueStatus;
          doca: string | null;
          previsao_descarregamento: string | null;
          posicao_fila: number | null;
          created_at: string;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
      queue_status: QueueStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
