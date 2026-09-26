import { useState, useEffect, useCallback } from 'react';
import { CalendarRange, Link2, Plus, X, ArrowRightCircle, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import type { Projeto, Tarefa } from '@/types/database';

interface PlanejamentoProps {
  selectedProjetoId: string | null;
  onSelectProjeto: (id: string) => void;
}

export default function Planejamento({ selectedProjetoId, onSelectProjeto }: PlanejamentoProps) {
  const { permissoes } = useRbac();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    data_inicio: '',
    data_fim: '',
    dependencia_id: '',
    valor_previsto: '',
  });

  const fetchProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    setProjetos((data as Projeto[]) || []);
  }, []);

  const fetchData = useCallback(async (projId: string) => {
    setLoading(true);
    const [projRes, tarRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase
        .from('tarefas')
        .select('*')
        .eq('projeto_id', projId)
        .order('data_inicio', { ascending: true }),
    ]);
    setProjeto(projRes.data as Projeto);
    setTarefas((tarRes.data as Tarefa[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  useEffect(() => {
    if (selectedProjetoId) fetchData(selectedProjetoId);
  }, [selectedProjetoId, fetchData]);

  const handleCreate = async () => {
    if (!selectedProjetoId || !form.nome || !form.data_inicio || !form.data_fim) return;
    await supabase.from('tarefas').insert({
      projeto_id: selectedProjetoId,
      nome: form.nome,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      dependencia_id: form.dependencia_id || null,
      valor_previsto: form.valor_previsto ? parseFloat(form.valor_previsto) : 0,
      percentual_concluido: 0,
    });
    setShowModal(false);
    setForm({ nome: '', data_inicio: '', data_fim: '', dependencia_id: '', valor_previsto: '' });
    fetchData(selectedProjetoId);
  };

  const handleUpdateProgress = async (id: string, percentual: number) => {
    const clamped = Math.max(0, Math.min(100, percentual));
    await supabase.from('tarefas').update({ percentual_concluido: clamped }).eq('id', id);
    setTarefas((prev) =>
      prev.map((t) => (t.id === id ? { ...t, percentual_concluido: clamped } : t))
    );
  };

  if (loading && !projeto) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selectedProjetoId || !projeto) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Selecione uma obra para visualizar o cronograma:</p>
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

  // Gantt chart calculations
  const allDates = tarefas.flatMap((t) => [new Date(t.data_inicio), new Date(t.data_fim)]);
  if (allDates.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        Nenhuma tarefa encontrada. Crie tarefas para visualizar o cronograma.
      </div>
    );
  }
  const minDate = new Date(Math.min(...allDates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...allDates.map((d) => d.getTime())));
  minDate.setDate(minDate.getDate() - 2);
  maxDate.setDate(maxDate.getDate() + 2);
  const totalDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Generate week markers
  const weeks: { label: string; offset: number }[] = [];
  const cursor = new Date(minDate);
  while (cursor < maxDate) {
    const offset = Math.round((cursor.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
    weeks.push({
      label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      offset,
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  const getDependenciaNome = (depId: string | null) => {
    if (!depId) return null;
    const dep = tarefas.find((t) => t.id === depId);
    return dep?.nome || null;
  };

  const today = new Date('2026-11-01');
  const todayOffset = Math.round((today.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24));
  const todayPct = (todayOffset / totalDays) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800">{projeto.nome}</h3>
          <p className="text-xs text-slate-500">
            {tarefas.length} tarefas - {tarefas.filter((t) => t.percentual_concluido === 100).length} concluídas
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
            permissoes.canEditTarefas
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`
          }
          disabled={!permissoes.canEditTarefas}
        >
          {permissoes.canEditTarefas ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          Nova Tarefa
        </button>
      </div>

      {/* Gantt Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Week headers */}
          <div className="flex border-b border-slate-200 pb-2 mb-3">
            <div className="w-64 flex-shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Tarefa
            </div>
            <div className="flex-1 relative h-6">
              {weeks.map((w, i) => (
                <div
                  key={i}
                  className="absolute top-0 text-xs text-slate-400 -translate-x-1/2"
                  style={{ left: `${(w.offset / totalDays) * 100}%` }}
                >
                  {w.label}
                </div>
              ))}
              {/* Today marker */}
              {todayPct >= 0 && todayPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-rose-400"
                  style={{ left: `${todayPct}%` }}
                >
                  <div className="absolute -top-1 -translate-x-1/2 w-2 h-2 rounded-full bg-rose-500" />
                </div>
              )}
            </div>
          </div>

          {/* Task rows */}
          <div className="space-y-2">
            {tarefas.map((tarefa) => {
              const start = new Date(tarefa.data_inicio);
              const end = new Date(tarefa.data_fim);
              const leftPct = ((start.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24 / totalDays)) * 100;
              const widthPct = Math.max(
                2,
                ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 / totalDays)) * 100
              );
              const depName = getDependenciaNome(tarefa.dependencia_id);

              return (
                <div key={tarefa.id} className="flex items-center group">
                  <div className="w-64 flex-shrink-0 pr-3">
                    <div className="flex items-center gap-1.5">
                      {depName && (
                        <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" title={`Depende de: ${depName}`} />
                      )}
                      <span className="text-sm text-slate-700 truncate">{tarefa.nome}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <span className="text-xs text-slate-400">
                        {start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} -{' '}
                        {end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 relative h-10">
                    {/* Today line */}
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div
                        className="absolute top-0 bottom-0 w-px bg-rose-200"
                        style={{ left: `${todayPct}%` }}
                      />
                    )}
                    {/* Bar */}
                    <div
                      className="absolute top-1.5 h-7 rounded-lg overflow-hidden flex items-center shadow-sm"
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                        background:
                          tarefa.percentual_concluido === 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : tarefa.percentual_concluido > 0
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #94a3b8, #64748b)',
                      }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-white/25"
                        style={{ width: `${tarefa.percentual_concluido}%` }}
                      />
                      <span className="px-2 text-xs font-semibold text-white truncate relative z-10">
                        {tarefa.percentual_concluido}%
                      </span>
                    </div>
                    {/* Dependency arrow */}
                    {depName && (
                      <div
                        className="absolute top-1.5 h-7 flex items-center"
                        style={{ left: `${Math.max(0, leftPct - 2)}%` }}
                      >
                        <ArrowRightCircle className="w-3 h-3 text-blue-400" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Progress controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-4">Controle de Avanço</h3>
        <div className="space-y-4">
          {tarefas.map((tarefa) => (
            <div key={tarefa.id} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700 truncate">{tarefa.nome}</span>
                  <span className="text-sm font-bold text-slate-800 ml-2 flex-shrink-0">
                    {tarefa.percentual_concluido}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={tarefa.percentual_concluido}
                  onChange={(e) => handleUpdateProgress(tarefa.id, parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              {tarefa.valor_previsto > 0 && permissoes.canSeeFinancial && (
                <div className="text-right flex-shrink-0 w-32">
                  <p className="text-xs text-slate-400">Valor Previsto</p>
                  <p className="text-sm font-semibold text-slate-700">
                    {tarefa.valor_previsto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal Nova Tarefa */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Nova Tarefa</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome da Tarefa *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Ex: Pintura das paredes"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Início *</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Fim *</label>
                  <input
                    type="date"
                    value={form.data_fim}
                    onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Depende de</label>
                <select
                  value={form.dependencia_id}
                  onChange={(e) => setForm({ ...form, dependencia_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                >
                  <option value="">Nenhuma dependência</option>
                  {tarefas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Valor Previsto (R$)</label>
                <input
                  type="number"
                  value={form.valor_previsto}
                  onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={!form.nome || !form.data_inicio || !form.data_fim}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
