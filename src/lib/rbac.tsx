import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { User } from '@supabase/supabase-js';
import { RbacContext, permissoesByCargo, type Cargo, type UsuarioPerfil } from './rbac-context';

export function RbacProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<UsuarioPerfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const authUserIdRef = useRef<string | null>(null);
  const profileRequestRef = useRef(0);
  const invalidateProfileRequests = useCallback(() => { ++profileRequestRef.current; }, []);

  const loadPerfil = useCallback(async (authUser: User) => {
    const request = ++profileRequestRef.current;
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .eq('ativo', true)
      .maybeSingle();

    if (request !== profileRequestRef.current) return;
    if (error) {
      console.error('Erro ao carregar perfil:', error.message);
      setPerfil(null);
      return;
    }
    if (data) {
      setPerfil(data as UsuarioPerfil);
    } else {
      // Only the verified Auth email may link an administrator-created profile.
      const { error: linkError } = await supabase.rpc('link_my_profile');
      if (request !== profileRequestRef.current) return;
      if (linkError) { console.error('Erro ao vincular perfil:', linkError.message); setPerfil(null); return; }
      const { data: linked, error: profileError } = await supabase.from('usuarios')
        .select('*').eq('auth_user_id', authUser.id).eq('ativo', true).maybeSingle();
      if (request !== profileRequestRef.current) return;
      setPerfil(profileError ? null : linked as UsuarioPerfil | null);
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
        authUserIdRef.current = session.user.id;
        setUser(session.user);
        loadPerfil(session.user).finally(() => mounted && authUserIdRef.current === session.user.id && setLoading(false));
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
        const userChanged = authUserIdRef.current !== session.user.id;
        authUserIdRef.current = session.user.id;
        setUser(session.user);
        if (userChanged) { setLoading(true); setPerfil(null); }
        setTimeout(() => {
          if (mounted) loadPerfil(session.user).finally(() => mounted && authUserIdRef.current === session.user.id && setLoading(false));
        }, 0);
      } else {
        authUserIdRef.current = null;
        ++profileRequestRef.current;
        setUser(null);
        setPerfil(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      invalidateProfileRequests();
      sub.subscription.unsubscribe();
    };
  }, [loadPerfil, recoveryMode, invalidateProfileRequests]);

  const signOut = useCallback(async () => {
    ++profileRequestRef.current;
    authUserIdRef.current = null;
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
