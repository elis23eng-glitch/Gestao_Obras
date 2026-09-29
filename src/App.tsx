import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Calculator,
  CalendarRange,
  Package,
  HardHat,
  BookOpen,
  Shield,
  Lock,
  Sparkles,
  LogOut,
  Loader2,
} from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import Obras from '@/components/Obras';
import Orcamentos from '@/components/Orcamentos';
import Planejamento from '@/components/Planejamento';
import Insumos from '@/components/Insumos';
import DiarioObra from '@/components/DiarioObra';
import AssistenteIA from '@/components/AssistenteIA';
import Login from '@/components/Login';
import { RbacProvider, useRbac, type Cargo } from '@/lib/rbac';

type Page = 'dashboard' | 'obras' | 'orcamentos' | 'planejamento' | 'insumos' | 'diario' | 'ia';

const cargoLabel: Record<Cargo, string> = {
  admin: 'Administrador',
  engenheiro: 'Engenheiro',
  mestre: 'Mestre de Obras',
};

const cargoColor: Record<Cargo, string> = {
  admin: 'bg-emerald-600',
  engenheiro: 'bg-blue-600',
  mestre: 'bg-amber-600',
};

function AppContent() {
  const { user, perfil, loading, permissoes, signOut } = useRbac();
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedProjetoId, setSelectedProjetoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [page]);

  // Reset selection and page when user changes
  useEffect(() => {
    setSelectedProjetoId(null);
    setPage('dashboard');
  }, [user?.id]);

  // Guard pages by permission
  useEffect(() => {
    if (page === 'orcamentos' && !permissoes.canEditOrcamento && !permissoes.canSeeFinancial) setPage('dashboard');
    if (page === 'insumos' && !permissoes.canManageProjetos) setPage('dashboard');
    if (page === 'ia' && !permissoes.canAccessAssistente) setPage('dashboard');
  }, [permissoes, page]);

  const handleSelectProjeto = (id: string) => {
    setSelectedProjetoId(id);
    if (permissoes.canSeeFinancial || permissoes.canEditOrcamento) {
      setPage('orcamentos');
    } else {
      setPage('planejamento');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (!perfil) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Perfil não vinculado</h2>
          <p className="text-sm text-slate-500 mb-6">
            Sua conta foi autenticada, mas ainda não foi vinculada a um perfil no sistema.
            Solicite ao administrador que cadastre seu perfil (cargo) para liberar o acesso.
          </p>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    );
  }

  const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; allowed: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, allowed: true },
    { id: 'obras', label: 'Obras', icon: Building2, allowed: true },
    { id: 'orcamentos', label: 'Orçamentos', icon: Calculator, allowed: permissoes.canSeeFinancial || permissoes.canEditOrcamento },
    { id: 'planejamento', label: 'Planejamento', icon: CalendarRange, allowed: true },
    { id: 'insumos', label: 'Banco de Insumos', icon: Package, allowed: permissoes.canManageProjetos },
    { id: 'diario', label: 'Diário de Obra', icon: BookOpen, allowed: permissoes.canCreateDiario },
    { id: 'ia', label: 'Assistente de IA', icon: Sparkles, allowed: permissoes.canAccessAssistente },
  ];

  const visibleNavItems = navItems.filter((item) => item.allowed);

  const pageSubtitle: Record<Page, string> = {
    dashboard: 'Visão geral do projeto e indicadores',
    obras: 'Gerencie seus projetos e obras',
    orcamentos: 'Orçamentação com EAP e BDI',
    planejamento: 'Cronograma e linha do tempo',
    insumos: 'Insumos, composições e equalização',
    diario: 'Registro diário de ocorrências na obra',
    ia: 'Análise inteligente de obras e cronogramas',
  };

  const cargo = perfil.cargo;

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 flex flex-col transition-transform duration-300 ease-in-out`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-700">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <HardHat className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-sm leading-tight">BuildManager</h1>
            <p className="text-slate-400 text-xs">Gestão de Obras</p>
          </div>
        </div>

        {/* User info */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-700/50">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60">
            <div className={`w-9 h-9 rounded-full ${cargoColor[cargo]} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
              {perfil.nome.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-semibold text-white truncate">{perfil.nome}</p>
              <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                <Shield className="w-2.5 h-2.5" />
                {cargoLabel[cargo]}
              </p>
            </div>
          </div>
          <div className="mt-2 px-3 py-2 bg-amber-500/10 rounded-lg">
            <div className="flex items-start gap-1.5">
              <Lock className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-300 leading-snug">
                {cargo === 'admin' && 'Acesso total a todas as telas, BDI e lucros.'}
                {cargo === 'engenheiro' && 'Orçamentos, cronogramas e insumos. BDI travado pelo admin.'}
                {cargo === 'mestre' && 'Apenas cronograma de campo e diário de obra. Custos bloqueados.'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Footer with logout */}
        <div className="px-3 py-3 border-t border-slate-700">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
            >
              <LayoutDashboard className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h2 className="text-lg lg:text-xl font-bold text-slate-800">
                {navItems.find((n) => n.id === page)?.label || 'Dashboard'}
              </h2>
              <p className="text-xs text-slate-500 hidden sm:block">{pageSubtitle[page]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${cargoColor[cargo]} text-white`}>
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{cargoLabel[cargo]}</span>
              <span className="sm:hidden">{perfil.nome.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {page === 'dashboard' && <Dashboard selectedProjetoId={selectedProjetoId} onSelectProjeto={handleSelectProjeto} />}
          {page === 'obras' && <Obras onSelectProjeto={handleSelectProjeto} />}
          {page === 'orcamentos' && (permissoes.canSeeFinancial || permissoes.canEditOrcamento) && (
            <Orcamentos
              selectedProjetoId={selectedProjetoId}
              onSelectProjeto={setSelectedProjetoId}
            />
          )}
          {page === 'planejamento' && (
            <Planejamento
              selectedProjetoId={selectedProjetoId}
              onSelectProjeto={setSelectedProjetoId}
            />
          )}
          {page === 'insumos' && permissoes.canManageProjetos && <Insumos />}
          {page === 'diario' && permissoes.canCreateDiario && (
            <DiarioObra
              selectedProjetoId={selectedProjetoId}
              onSelectProjeto={setSelectedProjetoId}
            />
          )}
          {page === 'ia' && permissoes.canAccessAssistente && <AssistenteIA selectedProjetoId={selectedProjetoId} />}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <RbacProvider>
      <AppContent />
    </RbacProvider>
  );
}

export default App;
