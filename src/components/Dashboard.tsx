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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import type { Projeto, Medicao, Tarefa, OrcamentoItem, Orcamento } from '@/types/database';

interface DashboardProps {
  onSelectProjeto: (id: string) => void;
}

export default function Dashboard({ onSelectProjeto }: DashboardProps) {
  const { permissoes } = useRbac();
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [orcamentoItens, setOrcamentoItens] = useState<OrcamentoItem[]>([]);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: projData } = await supabase
      .from('projetos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!projData) {
      setLoading(false);
      return;
    }
    setProjeto(projData as Projeto);

    const [medRes, tarRes, orcRes] = await Promise.all([
      supabase
        .from('medicoes')
        .select('*')
        .eq('projeto_id', projData.id)
        .order('data', { ascending: true }),
      supabase
        .from('tarefas')
        .select('*')
        .eq('projeto_id', projData.id)
        .order('data_inicio', { ascending: true }),
      supabase
        .from('orcamentos')
        .select('*')
        .eq('projeto_id', projData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setMedicoes((medRes.data as Medicao[]) || []);
    setTarefas((tarRes.data as Tarefa[]) || []);
    setOrcamento((orcRes.data as Orcamento) || null);

    if (orcRes.data) {
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('*, eap_item:eap_itens(*), composicao:composicoes(*)')
        .eq('orcamento_id', orcRes.data.id);
      setOrcamentoItens((itensData as OrcamentoItem[]) || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="text-center py-20 text-slate-500">
        Nenhum projeto encontrado. Crie uma obra na aba "Obras".
      </div>
    );
  }

  const custoDireto = orcamentoItens.reduce(
    (sum, item) => sum + item.quantidade * item.custo_unitario,
    0
  );
  const bdi = orcamento?.bdi_taxa || 25;
  const custoIndireto = custoDireto * (bdi / 100);
  const precoVenda = custoDireto + custoIndireto;

  const totalGasto = medicoes.length > 0 ? medicoes[medicoes.length - 1].valor_realizado : 0;
  const margemEstimada = precoVenda - totalGasto;
  const margemPct = precoVenda > 0 ? (margemEstimada / precoVenda) * 100 : 0;

  const today = new Date('2026-11-01');
  const dataTermino = projeto.data_termino ? new Date(projeto.data_termino) : null;
  const diasRestantes = dataTermino
    ? Math.max(0, Math.ceil((dataTermino.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  const concluidoGeral =
    tarefas.length > 0
      ? tarefas.reduce((sum, t) => sum + t.percentual_concluido, 0) / tarefas.length
      : 0;

  const ultimaMedicao = medicoes.length > 0 ? medicoes[medicoes.length - 1] : null;
  const desvioPercentual =
    ultimaMedicao && ultimaMedicao.percentual_previsto > 0
      ? ultimaMedicao.percentual_realizado - ultimaMedicao.percentual_previsto
      : 0;

  // Curva S data
  const curvaS = medicoes.map((m) => ({
    data: m.data,
    previsto: m.percentual_previsto,
    realizado: m.percentual_realizado,
  }));

  const maxCurvaS = 100;

  // Desvio por categoria (baseado nos itens do orçamento vs gasto proporcional)
  const categoriasDesvio = orcamentoItens.map((item) => {
    const orcado = item.quantidade * item.custo_unitario;
    const realizado = orcado * (concluidoGeral / 100);
    return {
      nome: item.descricao || item.eap_item?.nome || 'Item',
      orcado,
      realizado,
      desvio: orcado - realizado,
    };
  });

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
              {projeto.cliente} - {projeto.endereco}
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
            label="Margem de Lucro Estimada"
            value={`R$ ${margemEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            subtitle={`${margemPct.toFixed(1)}% do preço de venda`}
            trend={margemPct > 15 ? 'up' : 'down'}
            color="emerald"
          />
        ) : (
          <RestrictedKpi label="Margem de Lucro" />
        )}
        {permissoes.canSeeFinancial ? (
          <KpiCard
            icon={TrendingDown}
            label="Total Gasto"
            value={`R$ ${totalGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            subtitle={`de R$ ${precoVenda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} previsto`}
            trend="neutral"
            color="amber"
          />
        ) : (
          <RestrictedKpi label="Total Gasto" />
        )}
        <KpiCard
          icon={CalendarClock}
          label="Dias Restantes"
          value={`${diasRestantes}`}
          subtitle={dataTermino ? `Término: ${dataTermino.toLocaleDateString('pt-BR')}` : ''}
          trend={diasRestantes > 30 ? 'up' : 'down'}
          color="blue"
        />
        <KpiCard
          icon={Target}
          label="Conclusão Geral"
          value={`${concluidoGeral.toFixed(1)}%`}
          subtitle={`Previsto: ${ultimaMedicao?.percentual_previsto || 0}%`}
          trend={desvioPercentual >= 0 ? 'up' : 'down'}
          color="violet"
        />
      </div>

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
          <CurvaSChart data={curvaS} max={maxCurvaS} />
        </div>

        {/* Desvio de Orçamento - only for financial roles */}
        {permissoes.canSeeFinancial ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-bold text-slate-800">Desvio de Orçamento</h3>
                <p className="text-xs text-slate-500">Orçado vs. Gasto Real por item</p>
              </div>
            </div>
            <DesvioChart data={categoriasDesvio} />
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 border-dashed p-6 flex flex-col items-center justify-center text-center">
            <Lock className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-sm font-semibold text-slate-500">Desvio de Orçamento</p>
            <p className="text-xs text-slate-400 mt-1">Conteúdo financeiro restrito ao Diretor e Engenheiro</p>
          </div>
        )}
      </div>

      {/* Status das tarefas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4">Status das Tarefas</h3>
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
                  <span className="text-sm font-medium text-slate-700 truncate">
                    {tarefa.nome}
                  </span>
                  <span className="text-xs text-slate-500 ml-2 flex-shrink-0">
                    {tarefa.percentual_concluido}%
                  </span>
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
      </div>
    </div>
  );
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
  max,
}: {
  data: { data: string; previsto: number; realizado: number }[];
  max: number;
}) {
  if (data.length === 0) return <p className="text-sm text-slate-400">Sem dados</p>;
  const width = 100;
  const height = 200;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const toPoints = (key: 'previsto' | 'realizado') =>
    data
      .map((d, i) => `${(i * stepX).toFixed(2)},${(height - (d[key] / max) * height).toFixed(2)}`)
      .join(' ');

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: '200px' }}>
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((v) => (
          <line
            key={v}
            x1="0"
            y1={height - (v / max) * height}
            x2={width}
            y2={height - (v / max) * height}
            stroke="#f1f5f9"
            strokeWidth="0.3"
          />
        ))}
        {/* Previsto line */}
        <polyline
          points={toPoints('previsto')}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Realizado line */}
        <polyline
          points={toPoints('realizado')}
          fill="none"
          stroke="#10b981"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Points */}
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
  data,
}: {
  data: { nome: string; orcado: number; realizado: number; desvio: number }[];
}) {
  if (data.length === 0) return <p className="text-sm text-slate-400">Sem dados</p>;
  const maxVal = Math.max(...data.map((d) => Math.max(d.orcado, d.realizado)), 1);

  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-slate-600 truncate flex-1 mr-2">
              {item.nome}
            </span>
            <span
              className={`text-xs font-semibold flex-shrink-0 ${
                item.desvio > 0 ? 'text-emerald-600' : 'text-rose-500'
              }`}
            >
              {item.desvio > 0 ? '+' : ''}
              {item.desvio.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-16 flex-shrink-0">Orçado</span>
              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 rounded-full"
                  style={{ width: `${(item.orcado / maxVal) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-20 text-right">
                R$ {item.orcado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-16 flex-shrink-0">Gasto</span>
              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-400 rounded-full"
                  style={{ width: `${(item.realizado / maxVal) * 100}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-20 text-right">
                R$ {item.realizado.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
