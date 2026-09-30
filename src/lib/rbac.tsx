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
  recoveryMode: boolean;
  clearRecovery: () => void;
}

const RbacContext = createContext<RbacContextValue>({
  user: null,
  perfil: null,
  loading: true,
  permissoes: permissoesByCargo.mestre,
  signOut: async () => {},
  refreshPerfil: async () => {},
  recoveryMode: false,
  clearRecovery: () => {},
});

export function RbacProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

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

    // Detectar token de recuperação na URL antes de carregar a sessão
    const hash = window.location.hash;
    const isRecovery = hash && hash.includes('type=recovery');

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (isRecovery && session?.user) {
        // Modo recuperação: não carregar perfil, deixar Login mostrar o formulário de reset
        setRecoveryMode(true);
        setUser(session.user);
        setLoading(false);
        return;
      }
      if (session?.user) {
        setUser(session.user);
        loadPerfil(session.user).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setRecoveryMode(true);
        setUser(session.user);
        setLoading(false);
        return;
      }
      if (recoveryMode) return; // Ignorar outras mudanças enquanto estiver em modo recuperação
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
  }, [loadPerfil, recoveryMode]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
  }, []);

  const clearRecovery = useCallback(() => {
    setRecoveryMode(false);
    // Limpar o hash da URL
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const cargo: Cargo = perfil?.cargo || 'mestre';
  const permissoes = permissoesByCargo[cargo];

  return (
    <RbacContext.Provider value={{ user, perfil, loading, permissoes, signOut, refreshPerfil, recoveryMode, clearRecovery }}>
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
