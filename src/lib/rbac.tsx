import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from './supabase';
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

const permissoesByCargo: Record<Cargo, Permissoes> = {
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
}

const RbacContext = createContext<RbacContextValue>({
  user: null,
  perfil: null,
  loading: true,
  permissoes: permissoesByCargo.mestre,
  signOut: async () => {},
  refreshPerfil: async () => {},
});

export function RbacProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPerfil = useCallback(async (authUser: User) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao carregar perfil:', error.message);
      setPerfil(null);
      return;
    }
    if (data) {
      setPerfil(data as UsuarioPerfil);
    } else {
      // Try matching by email
      const { data: byEmail } = await supabase
        .from('usuarios')
        .select('*')
        .eq('email', authUser.email || '')
        .maybeSingle();
      if (byEmail) {
        // Link auth_user_id
        await supabase.from('usuarios').update({ auth_user_id: authUser.id }).eq('id', byEmail.id);
        setPerfil(byEmail as UsuarioPerfil);
      } else {
        setPerfil(null);
      }
    }
  }, []);

  const refreshPerfil = useCallback(async () => {
    if (user) await loadPerfil(user);
  }, [user, loadPerfil]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        loadPerfil(session.user).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        setUser(session.user);
        loadPerfil(session.user).finally(() => mounted && setLoading(false));
      } else {
        setUser(null);
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadPerfil]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
  }, []);

  const cargo: Cargo = perfil?.cargo || 'mestre';
  const permissoes = permissoesByCargo[cargo];

  return (
    <RbacContext.Provider value={{ user, perfil, loading, permissoes, signOut, refreshPerfil }}>
      {children}
    </RbacContext.Provider>
  );
}

export function useRbac() {
  return useContext(RbacContext);
}

// Demo mode: simulated profiles for preview without real auth
const demoPerfis: Record<string, UsuarioPerfil> = {
  admin: {
    id: 'demo-admin',
    nome: 'Administrador (Demo)',
    email: 'admin@demo.com',
    cargo: 'admin',
    auth_user_id: null,
  },
  engenheiro: {
    id: 'demo-eng',
    nome: 'Engenheiro (Demo)',
    email: 'eng@demo.com',
    cargo: 'engenheiro',
    auth_user_id: null,
  },
  mestre: {
    id: 'demo-mestre',
    nome: 'Mestre de Obras (Demo)',
    email: 'mestre@demo.com',
    cargo: 'mestre',
    auth_user_id: null,
  },
};

export const demoMode = {
  perfis: demoPerfis,
};
