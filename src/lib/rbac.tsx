import { createContext, useContext } from 'react';

export type Cargo = 'admin' | 'engenheiro' | 'mestre';

export interface UsuarioSimulado {
  id: string;
  nome: string;
  cargo: Cargo;
}

export interface Permissoes {
  canSeeFinancial: boolean;
  canEditBdi: boolean;
  canEditOrcamento: boolean;
  canSeeOrcamentos: boolean;
  canSeeInsumos: boolean;
  canEditTarefas: boolean;
  canUpdateProgress: boolean;
  canSeeDiario: boolean;
  canCreateDiario: boolean;
  canSeeIA: boolean;
}

export const permissoesPorCargo: Record<Cargo, Permissoes> = {
  admin: {
    canSeeFinancial: true,
    canEditBdi: true,
    canEditOrcamento: true,
    canSeeOrcamentos: true,
    canSeeInsumos: true,
    canEditTarefas: true,
    canUpdateProgress: true,
    canSeeDiario: true,
    canCreateDiario: true,
    canSeeIA: true,
  },
  engenheiro: {
    canSeeFinancial: true,
    canEditBdi: false,
    canEditOrcamento: true,
    canSeeOrcamentos: true,
    canSeeInsumos: true,
    canEditTarefas: true,
    canUpdateProgress: true,
    canSeeDiario: true,
    canCreateDiario: true,
    canSeeIA: true,
  },
  mestre: {
    canSeeFinancial: false,
    canEditBdi: false,
    canEditOrcamento: false,
    canSeeOrcamentos: false,
    canSeeInsumos: false,
    canEditTarefas: false,
    canUpdateProgress: true,
    canSeeDiario: true,
    canCreateDiario: true,
    canSeeIA: false,
  },
};

export const usuariosSimulados: UsuarioSimulado[] = [
  { id: 'u-admin', nome: 'Carlos Diretor', cargo: 'admin' },
  { id: 'u-eng', nome: 'Ana Engenheira', cargo: 'engenheiro' },
  { id: 'u-mestre', nome: 'José Mestre', cargo: 'mestre' },
];

export const cargoLabel: Record<Cargo, string> = {
  admin: 'Administrador / Diretor',
  engenheiro: 'Engenheiro de Planejamento',
  mestre: 'Mestre de Obras / Apontador',
};

export const cargoColor: Record<Cargo, string> = {
  admin: 'bg-emerald-500',
  engenheiro: 'bg-blue-500',
  mestre: 'bg-amber-500',
};

export interface RbacContextValue {
  usuario: UsuarioSimulado;
  permissoes: Permissoes;
  setUsuario: (u: UsuarioSimulado) => void;
}

export type Page = 'dashboard' | 'obras' | 'orcamentos' | 'planejamento' | 'insumos' | 'diario' | 'ia';

export const RbacContext = createContext<RbacContextValue | null>(null);

export function useRbac(): RbacContextValue {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error('useRbac must be used within RbacProvider');
  return ctx;
}
