import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CalendarClock,
  Target,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import { formatBRL, round2, precoVenda as calcPrecoVenda, custoDireto as calcCustoDireto, avançoFisico, daysBetween } from '@/lib/calc';
import type { Projeto, Medicao, Tarefa, OrcamentoItem, Orcamento } from '@/types/database';

interface DashboardProps {
  selectedProjetoId: string | null;
  onSelectProjeto: (id: string) => void;
}

export default function Dashboard({ selectedProjetoId, onSelectProjeto }: DashboardProps) {
  const { permissoes } = useRbac();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [orcamentoItens, setOrcamentoItens] = useState<OrcamentoItem[]>([]);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reqId, setReqId] = useState(0);

  const fetchProjetos = useCallback(async () => {
    const { data, error: err } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    if (err) { setError(err.message); return; }
    setProjetos((data as Projeto[]) || []);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  const fetchProjetoData = useCallback(async (projId: string, currentReqId: number) => {
    setLoading(true);
    setError(null);

    const [projRes, medRes, tarRes, orcRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase.from('medicoes').select('*').eq('projeto_id', projId).order('data', { ascending: true }),
      supabase.from('tarefas').select('*').eq('projeto_id', projId).order('data_inicio', { ascending: true }),
      supabase.from('orcamentos').select('*').eq('projeto_id', projId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (currentReqId !== reqId) return;

    if (projRes.error) { setError(projRes.error.message); setLoading(false); return; }
    setProjeto(projRes.data as Projeto);
    setMedicoes((medRes.data as Medicao[]) || []);
    setTarefas((tarRes.data as Tarefa[]) || []);
    setOrcamento((orcRes.data as Orcamento) || null);

    if (orcRes.data) {
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('*, eap_item:eap_itens(*), composicao:composicoes(*)')
        .eq('orcamento_id', orcRes.data.id);
      if (currentReqId !== reqId) return;
      setOrcamentoItens((itensData as OrcamentoItem[]) || []);
    } else {
      setOrcamentoItens([]);
    }

    setLoading(false);
  }, [reqId]);

  useEffect(() => {
    if (selectedProjetoId) {
      const newReqId = reqId + 1;
      setReqId(newReqId);
      setProjeto(null);
      setMedicoes([]);
      setTarefas([]);
      setOrcamentoItens([]);
      setOrcamento(null);
      fetchProjetoData(selectedProjetoId, newReqId);
    } else {
      setProjeto(null);
      setLoading(false);
    }
  }, [selectedProjetoId]);

  const handleRetry = () => {
    if (selectedProjetoId) {
      const newReqId = reqId + 1;
      setReqId(newReqId);
      fetchProjetoData(selectedProjetoId, newReqId);
    } else {
      fetchProjetos();
    }
  };

  if (loading && projetos.length === 0 && !selectedProjetoId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error && !projeto) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-12 h-12 text-rose-300 mx-auto mb-4" />
        <p className="text-slate-600 mb-2">Erro ao carregar dados</p>
        <p className="text-sm text-slate-400 mb-4">{error}</p>
        <button onClick={handleRetry} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold">
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!selectedProjetoId) {
    if (projetos.length === 0) {
      return (
        <div className="text-center py-20">
          <Target className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">Nenhuma obra cadastrada</p>
          <p className="text-sm text-slate-400 mb-4">Crie uma obra na aba "Obras" para começar.</p>
          <button onClick={() => onSelectProjeto('')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold">
            <ArrowRight className="w-4 h-4" /> Ir para Obras
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Selecione uma obra para visualizar os indicadores:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projetos.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectProjeto(p.id)}
              className="text-left bg-white rounded-xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <h4 className="font-semibold text-slate-800 text-sm mb-1">{p.nome}</h4>
              <p className="text-xs text-slate-500">{p.cliente}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading && !projeto) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p>Obra não encontrada ou sem acesso.</p>
      </div>
    );
  }

  // Calculate indicators using centralized calc lib
  const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
  const taxaBdi = orcamento?.bdi_taxa ?? 0;
  const pv = calcPrecoVenda(cd, taxaBdi);
  const valorBdi = round2(cd * taxaBdi / 100);

  // Avanço físico
  const avanço = avançoFisico(tarefas.map(t => ({ percentual_concluido: t.percentual_concluido, valor_previsto: t.valor_previsto })));
  const concluidoGeral = avanço.percentual;

  // Custo realizado: sum of valor_realizado from medicoes (acumulado)
  const custoRealizado = medicoes.length > 0
    ? round2(medicoes.reduce((s, m) => s + m.valor_realizado, 0))
    : 0;

  // Custo restante previsto = custo direto * (1 - avanço/100)
  const custoRestantePrevisto = round2(cd * (1 - concluidoGeral / 100));

  // Resultado final estimado = preco de venda - custo realizado - custo restante previsto
  const resultadoFinalEstimado = round2(pv - custoRealizado - custoRestantePrevisto);
  const hasDataForEstimativa = cd > 0 || custoRealizado > 0;

  // Today (real current date)
  const today = new Date();
  const dataTermino = projeto.data_termino ? new Date(projeto.data_termino) : null;
  const diasRestantes = dataTermino
    ? Math.max(0, daysBetween(today, dataTermino))
    : 0;

  // Última medição
  const ultimaMedicao = medicoes.length > 0 ? medicoes[medicoes.length - 1] : null;
  const desvioPontos = ultimaMedicao
    ? round2(ultimaMedicao.percentual_realizado - ultimaMedicao.percentual_previsto)
    : 0;

  // Curva S
  const curvaS = medicoes.map((m) => ({
    data: m.data,
    previsto: m.percentual_previsto,
    realizado: m.percentual_realizado,
  }));

  return (
    <div className="space-y-6">
      {/* Project header card */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-6 lg:p-8 text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                {projeto.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <h3 className="text-xl lg:text-2xl font-bold mb-1">{projeto.nome}</h3>
            <p className="text-slate-400 text-sm">
              {projeto.cliente}{projeto.endereco ? ` - ${projeto.endereco}` : ''}
            </p>
          </div>
          <button
            onClick={() => onSelectProjeto(projeto.id)}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
          >
            Ver Orçamento
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {permissoes.canSeeFinancial ? (
          <KpiCard
            icon={Wallet}
            label="Preço de Venda"
            value={formatBRL(pv)}
            subtitle={`Custo direto: ${formatBRL(cd)} + BDI ${formatBRL(valorBdi)}`}
            trend="neutral"
            color="emerald"
          />
        ) : (
          <RestrictedKpi label="Preço de Venda" />
        )}
        {permissoes.canSeeFinancial ? (
          <KpiCard
            icon={TrendingDown}
            label="Custo Realizado"
            value={formatBRL(custoRealizado)}
            subtitle={medicoes.length > 0 ? `${medicoes.length} medições registradas` : 'Sem medições'}
            trend="neutral"
            color="amber"
          />
        ) : (
          <RestrictedKpi label="Custo Realizado" />
        )}
        <KpiCard
          icon={CalendarClock}
          label="Dias Restantes"
          value={`${diasRestantes}`}
          subtitle={dataTermino ? `Término: ${dataTermino.toLocaleDateString('pt-BR')}` : 'Sem data definida'}
          trend={diasRestantes > 30 ? 'up' : 'down'}
          color="blue"
        />
        <KpiCard
          icon={Target}
          label="Avanço Físico"
          value={`${formatBR(concluidoGeral, 1)}%`}
          subtitle={avanço.isWeighted ? 'Ponderado por valor' : 'Média simples'}
          trend={desvioPontos >= 0 ? 'up' : 'down'}
          color="violet"
        />
      </div>

      {/* Resultado estimado row */}
      {permissoes.canSeeFinancial && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-bold text-slate-800 mb-4">Resultado Final Estimado</h3>
          {hasDataForEstimativa ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Preço de Venda</p>
                <p className="text-lg font-bold text-slate-800">{formatBRL(pv)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Custo Realizado</p>
                <p className="text-lg font-bold text-amber-600">{formatBRL(custoRealizado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Custo Restante Previsto</p>
                <p className="text-lg font-bold text-slate-600">{formatBRL(custoRestantePrevisto)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Resultado Estimado</p>
                <p className={`text-lg font-bold ${resultadoFinalEstimado >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {formatBRL(resultadoFinalEstimado)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Dados insuficientes. Cadastre orçamento e medições para estimar o resultado final.</p>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Curva S */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-slate-800">Curva S</h3>
              <p className="text-xs text-slate-500">Previsto vs. Realizado</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-blue-500" /> Previsto
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500" /> Realizado
              </span>
            </div>
          </div>
          {curvaS.length > 0 ? (
            <CurvaSChart data={curvaS} />
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Target className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Sem medições registradas.</p>
              <p className="text-xs mt-1">Registre medições na aba Planejamento para visualizar a curva S.</p>
            </div>
          )}
        </div>

        {/* Desvio de Orçamento */}
        {permissoes.canSeeFinancial ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-slate-800">Desvio de Orçamento</h3>
                <p className="text-xs text-slate-500">Orçado vs. Realizado por item</p>
              </div>
            </div>
            {orcamentoItens.length > 0 && medicoes.length > 0 ? (
              <DesvioChart itens={orcamentoItens} medicoes={medicoes} concluidoGeral={concluidoGeral} />
            ) : (
              <div className="text-center py-12 text-slate-400">
                <p className="text-sm">Dados insuficientes para desvio.</p>
                <p className="text-xs mt-1">Cadastre orçamento e medições para comparar.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 border-dashed p-6 flex flex-col items-center justify-center text-center">
            <Lock className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">Desvio de Orçamento</p>
            <p className="text-xs text-slate-400 mt-1">Conteúdo financeiro restrito</p>
          </div>
        )}
      </div>

      {/* Status das tarefas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4">Status das Tarefas</h3>
        {tarefas.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Clock className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">Nenhuma tarefa cadastrada.</p>
            <p className="text-xs mt-1">Crie tarefas na aba Planejamento para acompanhar o andamento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tarefas.map((tarefa) => (
              <div key={tarefa.id} className="flex items-center gap-4">
                <div className="flex items-center gap-2 w-8">
                  {tarefa.percentual_concluido === 100 ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : tarefa.percentual_concluido > 0 ? (
                    <Clock className="w-5 h-5 text-amber-500" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 truncate">{tarefa.nome}</span>
                    <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{tarefa.percentual_concluido}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        tarefa.percentual_concluido === 100
                          ? 'bg-emerald-500'
                          : tarefa.percentual_concluido > 0
                          ? 'bg-amber-400'
                          : 'bg-slate-300'
                      }`}
                      style={{ width: `${tarefa.percentual_concluido}%` }}
                    />
                  </div>
                </div>
                <div className="hidden sm:block text-xs text-slate-400 w-24 text-right">
                  {new Date(tarefa.data_inicio).toLocaleDateString('pt-BR')} -{' '}
                  {new Date(tarefa.data_fim).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Última medição desvio */}
      {ultimaMedicao && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${desvioPontos >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            {desvioPontos >= 0 ? <TrendingUp className="w-6 h-6 text-emerald-600" /> : <TrendingDown className="w-6 h-6 text-rose-500" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Desvio: {desvioPontos >= 0 ? '+' : ''}{desvioPontos} pontos percentuais
            </p>
            <p className="text-xs text-slate-500">
              Realizado {ultimaMedicao.percentual_realizado}% vs Previsto {ultimaMedicao.percentual_previsto}% em {new Date(ultimaMedicao.data).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBR(value: number, decimals = 2): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function RestrictedKpi({ label }: { label: string }) {
  return (
    <div className="bg-slate-50 rounded-2xl border border-slate-200 border-dashed p-5 flex flex-col items-center justify-center text-center">
      <Lock className="w-5 h-5 text-slate-300 mb-2" />
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xs text-slate-300 mt-0.5">Acesso restrito</p>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  trend,
  color,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  subtitle: string;
  trend: 'up' | 'down' | 'neutral';
  color: 'emerald' | 'amber' | 'blue' | 'violet';
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-500" />}
        {trend === 'down' && <TrendingDown className="w-4 h-4 text-rose-500" />}
      </div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

function CurvaSChart({
  data,
}: {
  data: { data: string; previsto: number; realizado: number }[];
}) {
  const width = 100;
  const height = 200;
  const max = 100;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const toPoints = (key: 'previsto' | 'realizado') =>
    data
      .map((d, i) => `${(i * stepX).toFixed(2)},${(height - (d[key] / max) * height).toFixed(2)}`)
      .join(' ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: '200px' }}>
        {[0, 25, 50, 75, 100].map((v) => (
          <line key={v} x1="0" y1={height - (v / max) * height} x2={width} y2={height - (v / max) * height} stroke="#f1f5f9" strokeWidth="0.3" />
        ))}
        <polyline points={toPoints('previsto')} fill="none" stroke="#3b82f6" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={toPoints('realizado')} fill="none" stroke="#10b981" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={i * stepX} cy={height - (d.previsto / max) * height} r="0.8" fill="#3b82f6" />
            <circle cx={i * stepX} cy={height - (d.realizado / max) * height} r="0.8" fill="#10b981" />
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-2 text-xs text-slate-400">
        {data.map((d, i) => (
          <span key={i} className={i % 2 === 0 ? '' : 'hidden'}>
            {new Date(d.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        ))}
      </div>
    </div>
  );
}

function DesvioChart({
  itens,
  medicoes,
  concluidoGeral,
}: {
  itens: OrcamentoItem[];
  medicoes: Medicao[];
  concluidoGeral: number;
}) {
  const maxVal = Math.max(...itens.map(i => i.quantidade * i.custo_unitario), 1);

  return (
    <div className="space-y-3">
      {itens.slice(0, 10).map((item) => {
        const orcado = item.quantidade * item.custo_unitario;
        const realizado = orcado * (concluidoGeral / 100);
        const desvio = round2(orcado - realizado);
        return (
          <div key={item.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-600 truncate flex-1 mr-2">
                {item.descricao || item.composicao?.nome || 'Item'}
              </span>
              <span className={`text-xs font-semibold flex-shrink-0 ${desvio >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {desvio >= 0 ? '+' : ''}{formatBRL(desvio)}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-16 flex-shrink-0">Orçado</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(orcado / maxVal) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-24 text-right">{formatBRL(orcado)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-16 flex-shrink-0">Realizado</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(realizado / maxVal) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-24 text-right">{formatBRL(realizado)}</span>
              </div>
            </div>
          </div>
        );
      })}
      {itens.length > 10 && (
        <p className="text-xs text-slate-400 text-center pt-2">Mostrando 10 de {itens.length} itens</p>
      )}
    </div>
  );
}
