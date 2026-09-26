import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Calculator,
  CalendarRange,
  Package,
  HardHat,
  BookOpen,
  ChevronDown,
  Shield,
  Lock,
  Sparkles,
  X,
} from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import Obras from '@/components/Obras';
import Orcamentos from '@/components/Orcamentos';
import Planejamento from '@/components/Planejamento';
import Insumos from '@/components/Insumos';
import DiarioObra from '@/components/DiarioObra';
import AssistenteIA from '@/components/AssistenteIA';
import {
  RbacContext,
  RbacContextValue,
  usuariosSimulados,
  permissoesPorCargo,
  cargoLabel,
  cargoColor,
  type UsuarioSimulado,
  type Page,
} from '@/lib/rbac';

function App() {
  const [usuario, setUsuario] = useState<UsuarioSimulado>(usuariosSimulados[0]);
  const [page, setPage] = useState<Page>('dashboard');
  const [selectedProjetoId, setSelectedProjetoId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const permissoes = permissoesPorCargo[usuario.cargo];

  const rbacValue: RbacContextValue = {
    usuario,
    permissoes,
    setUsuario,
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [page]);

  useEffect(() => {
    setProfileOpen(false);
  }, [usuario]);

  useEffect(() => {
    if (page === 'orcamentos' && !permissoes.canSeeOrcamentos) setPage('dashboard');
    if (page === 'insumos' && !permissoes.canSeeInsumos) setPage('dashboard');
    if (page === 'ia' && !permissoes.canSeeIA) setPage('dashboard');
  }, [permissoes, page]);

  const handleSelectProjeto = (id: string) => {
    setSelectedProjetoId(id);
    if (permissoes.canSeeOrcamentos) {
      setPage('orcamentos');
    } else {
      setPage('planejamento');
    }
  };

  const navItems: { id: Page; label: string; icon: typeof LayoutDashboard; allowed: boolean }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, allowed: true },
    { id: 'obras', label: 'Obras', icon: Building2, allowed: true },
    { id: 'orcamentos', label: 'Orçamentos', icon: Calculator, allowed: permissoes.canSeeOrcamentos },
    { id: 'planejamento', label: 'Planejamento', icon: CalendarRange, allowed: true },
    { id: 'insumos', label: 'Banco de Insumos', icon: Package, allowed: permissoes.canSeeInsumos },
    { id: 'diario', label: 'Diário de Obra', icon: BookOpen, allowed: permissoes.canSeeDiario },
    { id: 'ia', label: 'Assistente de IA', icon: Sparkles, allowed: permissoes.canSeeIA },
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

  return (
    <RbacContext.Provider value={rbacValue}>
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

          {/* Simular Perfil - at top of sidebar */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-700/50 relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition-colors"
            >
              <div className={`w-9 h-9 rounded-full ${cargoColor[usuario.cargo]} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                {usuario.nome.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-semibold text-white truncate">{usuario.nome}</p>
                <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" />
                  {cargoLabel[usuario.cargo]}
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${profileOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
                <div className="absolute left-3 right-3 top-full mt-1 bg-slate-800 rounded-xl shadow-xl border border-slate-700 z-50 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-700/50 border-b border-slate-700">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Simular Perfil</span>
                    </div>
                  </div>
                  <div className="py-1">
                    {usuariosSimulados.map((u) => {
                      const isActive = u.id === usuario.id;
                      return (
                        <button
                          key={u.id}
                          onClick={() => setUsuario(u)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-700/50 transition-colors ${
                            isActive ? 'bg-emerald-500/10' : ''
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-full ${cargoColor[u.cargo]} flex items-center justify-center text-white font-bold text-xs flex-shrink-0`}>
                            {u.nome.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-semibold text-white truncate">{u.nome}</p>
                            <p className="text-xs text-slate-400 truncate">{cargoLabel[u.cargo]}</p>
                          </div>
                          {isActive && <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-3 py-2 border-t border-slate-700 bg-amber-500/10">
                    <div className="flex items-start gap-1.5">
                      <Lock className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-amber-300 leading-snug">
                        {usuario.cargo === 'admin' && 'Acesso total a todas as telas, BDI e lucros.'}
                        {usuario.cargo === 'engenheiro' && 'Orçamentos, cronogramas e insumos. BDI travado pelo Diretor.'}
                        {usuario.cargo === 'mestre' && 'Apenas cronograma de campo e diário de obra. Custos bloqueados.'}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
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

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-700">
            <p className="text-slate-500 text-xs">v2.0 - RBAC + IA</p>
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

            {/* Role indicator badge */}
            <div className="flex items-center gap-2">
              <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${cargoColor[usuario.cargo]} text-white`}>
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{cargoLabel[usuario.cargo]}</span>
                <span className="sm:hidden">{usuario.nome.split(' ')[0]}</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-8">
            {page === 'dashboard' && <Dashboard onSelectProjeto={handleSelectProjeto} />}
            {page === 'obras' && <Obras onSelectProjeto={handleSelectProjeto} />}
            {page === 'orcamentos' && permissoes.canSeeOrcamentos && (
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
            {page === 'insumos' && permissoes.canSeeInsumos && <Insumos />}
            {page === 'diario' && permissoes.canSeeDiario && (
              <DiarioObra
                selectedProjetoId={selectedProjetoId}
                onSelectProjeto={setSelectedProjetoId}
              />
            )}
            {page === 'ia' && permissoes.canSeeIA && <AssistenteIA />}
          </main>
        </div>
      </div>
    </RbacContext.Provider>
  );
}

export default App;
