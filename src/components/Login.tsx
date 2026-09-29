import { useState } from 'react';
import { Building2, Mail, Lock, LogIn, AlertCircle, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup' | 'recovery'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState('');

  const handleSubmit = async () => {
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (data.user) {
          setInfo('Conta criada. Solicite ao administrador que vincule seu perfil (cargo) no sistema para acessar as funcionalidades.');
          setMode('login');
        }
      } else if (mode === 'recovery') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (err) throw err;
        setInfo('Enviamos um e-mail com instruções para recuperar sua senha.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">BuildManager</h1>
          <p className="text-slate-400 text-sm mt-1">Gestão de Obras e Orçamentos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${mode === 'login' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
            >
              Entrar
            </button>
            <button
              onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${mode === 'signup' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
            >
              Criar Conta
            </button>
            <button
              onClick={() => { setMode('recovery'); setError(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${mode === 'recovery' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
            >
              Recuperar
            </button>
          </div>

          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Seu nome completo"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="seu@email.com"
                />
              </div>
            </div>
            {mode !== 'recovery' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-rose-600">{error}</p>
              </div>
            )}
            {info && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-600">{info}</p>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || (mode !== 'recovery' && !password)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <LogIn className="w-4 h-4" />
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar Conta' : 'Enviar'}
            </button>
          </div>

          <p className="text-xs text-slate-400 mt-6 text-center">
            {mode === 'signup'
              ? 'Após criar a conta, o administrador deve vincular seu perfil (cargo) para liberar o acesso.'
              : 'Acesso restrito a usuários autorizados.'}
          </p>
        </div>
      </div>
    </div>
  );
}
