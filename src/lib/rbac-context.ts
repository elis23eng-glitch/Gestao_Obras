import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
export type Cargo = 'admin' | 'engenheiro' | 'mestre';

export interface Permissoes {
  canManageUsers: boolean;
  canManageProjetos: boolean;
  canEditOrcamento: boolean;
  canEditBdi: boolean;
  canEditTarefas: boolean;
  canEditProgress: boolean;
  canCreateDiario: boolean;
  canEditDiario: boolean;
  canSeeFinancial: boolean;
  canSeeBdi: boolean;
  canAccessAssistente: boolean;
}

export interface UsuarioPerfil {
  id: string;
  nome: string;
  email: string;
  cargo: Cargo;
  auth_user_id: string | null;
}

export const permissoesByCargo: Record<Cargo, Permissoes> = {
  admin: {
    canManageUsers: true,
    canManageProjetos: true,
    canEditOrcamento: true,
    canEditBdi: true,
    canEditTarefas: true,
    canEditProgress: true,
    canCreateDiario: true,
    canEditDiario: true,
    canSeeFinancial: true,
    canSeeBdi: true,
    canAccessAssistente: true,
  },
  engenheiro: {
    canManageUsers: false,
    canManageProjetos: true,
    canEditOrcamento: true,
    canEditBdi: false,
    canEditTarefas: true,
    canEditProgress: true,
    canCreateDiario: true,
    canEditDiario: true,
    canSeeFinancial: true,
    canSeeBdi: true,
    canAccessAssistente: true,
  },
  mestre: {
    canManageUsers: false,
    canManageProjetos: false,
    canEditOrcamento: false,
    canEditBdi: false,
    canEditTarefas: false,
    canEditProgress: true,
    canCreateDiario: true,
    canEditDiario: true,
    canSeeFinancial: false,
    canSeeBdi: false,
    canAccessAssistente: false,
  },
};

interface RbacContextValue {
  user: User | null;
  perfil: UsuarioPerfil | null;
  loading: boolean;
  permissoes: Permissoes;
  signOut: () => Promise<void>;
  refreshPerfil: () => Promise<void>;
  recoveryMode: boolean;
  clearRecovery: () => void;
}

export const RbacContext = createContext<RbacContextValue>({
  user: null,
  perfil: null,
  loading: true,
  permissoes: permissoesByCargo.mestre,
  signOut: async () => {},
  refreshPerfil: async () => {},
  recoveryMode: false,
  clearRecovery: () => {},
});

export function useRbac() { return useContext(RbacContext); }
