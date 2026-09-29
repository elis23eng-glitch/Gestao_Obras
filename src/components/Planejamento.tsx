import { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarRange, Link2, Plus, X, ArrowRightCircle, Lock, Loader2, Check, AlertCircle, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import { parseBR, formatBR, formatBRL, ganttPosition, ganttWidth, daysBetween, round2 } from '@/lib/calc';
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
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    data_inicio: '',
    data_fim: '',
    dependencia_id: '',
    valor_previsto: '',
  });
  const [progressDrafts, setProgressDrafts] = useState<Record<string, number>>({});
  const [savedIndicator, setSavedIndicator] = useState<string | null>(null);
  const reqRef = useRef(0);

  const fetchProjetos = useCallback(async () => {
    const { data, error: err } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    if (err) { setError(err.message); return; }
    setProjetos((data as Projeto[]) || []);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  const fetchData = useCallback(async (projId: string) => {
    const currentReq = ++reqRef.current;
    setLoading(true);
    setError(null);

    const [projRes, tarRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase.from('tarefas').select('*').eq('projeto_id', projId).order('data_inicio', { ascending: true }),
    ]);

    if (currentReq !== reqRef.current) return;

    if (projRes.error) { setError(projRes.error.message); setLoading(false); return; }
    setProjeto(projRes.data as Projeto);
    setTarefas((tarRes.data as Tarefa[]) || []);
    setProgressDrafts({});
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedProjetoId) {
      setProjeto(null);
      setTarefas([]);
      fetchData(selectedProjetoId);
    } else {
      setProjeto(null);
      setLoading(false);
    }
  }, [selectedProjetoId, fetchData]);

  const validateDates = (): string | null => {
    if (!form.data_inicio || !form.data_fim) return 'Preencha as datas de início e fim';
    const start = new Date(form.data_inicio);
    const end = new Date(form.data_fim);
    if (isNaN(start.getTime())) return 'Data de início inválida';
    if (isNaN(end.getTime())) return 'Data de fim inválida';
    if (end < start) return 'Data final não pode ser anterior à inicial';
    return null;
  };

  const handleCreate = async () => {
    if (!selectedProjetoId) return;
    setFormError(null);
    if (!form.nome) { setFormError('Nome é obrigatório'); return; }
    const dateErr = validateDates();
    if (dateErr) { setFormError(dateErr); return; }

    // Validate dependency belongs to same project and is not circular
    if (form.dependencia_id) {
      const dep = tarefas.find(t => t.id === form.dependencia_id);
      if (!dep) { setFormError('Dependência inválida'); return; }
      if (dep.projeto_id !== selectedProjetoId) { setFormError('Dependência deve ser da mesma obra'); return; }
    }

    const valor = form.valor_previsto ? parseBR(form.valor_previsto) : 0;
    if (valor < 0 || !isFinite(valor)) { setFormError('Valor previsto inválido'); return; }

    setSaving(true);
    const { error: err } = await supabase.from('tarefas').insert({
      projeto_id: selectedProjetoId,
      nome: form.nome,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      dependencia_id: form.dependencia_id || null,
      valor_previsto: valor,
      percentual_concluido: 0,
    });
    setSaving(false);

    if (err) { setFormError(err.message); return; }
    setShowModal(false);
    setForm({ nome: '', data_inicio: '', data_fim: '', dependencia_id: '', valor_previsto: '' });
    fetchData(selectedProjetoId);
  };

  // Debounced progress save
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProgressChange = (id: string, percentual: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(percentual)));
    setProgressDrafts(prev => ({ ...prev, [id]: clamped }));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const { error: err } = await supabase.from('tarefas').update({ percentual_concluido: clamped }).eq('id', id);
      if (err) {
        setError('Erro ao salvar progresso: ' + err.message);
      } else {
        setTarefas(prev => prev.map(t => t.id === id ? { ...t, percentual_concluido: clamped } : t));
        setProgressDrafts(prev => { const next = { ...prev }; delete next[id]; return next; });
        setSavedIndicator(id);
        setTimeout(() => setSavedIndicator(null), 2000);
      }
    }, 600);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  // Check for date conflicts with dependencies
  const checkDependencyConflict = (tarefa: Tarefa): string | null => {
    if (!tarefa.dependencia_id) return null;
    const dep = tarefas.find(t => t.id === tarefa.dependencia_id);
    if (!dep) return 'Dependência não encontrada';
    const taskStart = new Date(tarefa.data_inicio);
    const depEnd = new Date(dep.data_fim);
    if (taskStart < depEnd) {
      return `Início (${taskStart.toLocaleDateString('pt-BR')}) é anterior ao término da dependência "${dep.nome}" (${depEnd.toLocaleDateString('pt-BR')})`;
    }
    return null;
  };

  if (loading && !projeto) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error && !projeto) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-rose-300 mx-auto mb-4" />
        <p className="text-slate-600 mb-2">Erro ao carregar</p>
        <p className="text-sm text-slate-400 mb-4">{error}</p>
        <button onClick={() => selectedProjetoId && fetchData(selectedProjetoId)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!selectedProjetoId || !projeto) {
    if (projetos.length === 0) {
      return (
        <div className="text-center py-20">
          <CalendarRange className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">Nenhuma obra cadastrada</p>
          <p className="text-sm text-slate-400">Crie uma obra na aba "Obras" para planejar o cronograma.</p>
        </div>
      );
    }
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

  // Gantt chart calculations — using real today
  const today = new Date();

  if (tarefas.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800">{projeto.nome}</h3>
            <p className="text-xs text-slate-500">Nenhuma tarefa cadastrada</p>
          </div>
          {permissoes.canEditTarefas && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold"
            >
              <Plus className="w-4 h-4" /> Criar Primeira Tarefa
            </button>
          )}
        </div>
        <div className="text-center py-20">
          <CalendarRange className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-1">Cronograma vazio</p>
          <p className="text-sm text-slate-400">
            {permissoes.canEditTarefas
              ? 'Crie a primeira tarefa para visualizar o cronograma.'
              : 'Aguarde o engenheiro cadastrar tarefas.'}
          </p>
        </div>
        {showModal && renderModal()}
      </div>
    );
  }

  // Calculate Gantt window
  const allDates = tarefas.flatMap((t) => [new Date(t.data_inicio), new Date(t.data_fim)]);
  const validDates = allDates.filter(d => !isNaN(d.getTime()));
  if (validDates.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <AlertCircle className="w-12 h-12 text-rose-300 mx-auto mb-4" />
        <p>Datas inválidas nas tarefas. Verifique os dados.</p>
      </div>
    );
  }

  const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
  const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
  // Pad window by 2 days each side
  minDate.setDate(minDate.getDate() - 2);
  maxDate.setDate(maxDate.getDate() + 2);
  const totalDays = Math.max(1, daysBetween(minDate, maxDate));

  // Week markers
  const weeks: { label: string; offset: number }[] = [];
  const cursor = new Date(minDate);
  while (cursor <= maxDate) {
    const offset = daysBetween(minDate, cursor);
    weeks.push({
      label: cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      offset,
    });
    cursor.setDate(cursor.getDate() + 7);
  }

  const todayOffset = daysBetween(minDate, today);
  const todayPct = totalDays > 0 ? (todayOffset / totalDays) * 100 : 0;

  const getDependenciaNome = (depId: string | null) => {
    if (!depId) return null;
    const dep = tarefas.find(t => t.id === depId);
    return dep?.nome || null;
  };

  function renderModal() {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-800">Nova Tarefa</h3>
            <button onClick={() => { setShowModal(false); setFormError(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
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
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Valor Previsto (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.valor_previsto}
                onChange={(e) => setForm({ ...form, valor_previsto: e.target.value })}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                placeholder="0,00"
              />
            </div>
            {formError && (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                <p className="text-sm text-rose-600">{formError}</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => { setShowModal(false); setFormError(null); }}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.nome || !form.data_inicio || !form.data_fim}
              className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
            >
              {saving ? 'Salvando...' : 'Criar Tarefa'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800">{projeto.nome}</h3>
          <p className="text-xs text-slate-500">
            {tarefas.length} tarefas - {tarefas.filter(t => t.percentual_concluido === 100).length} concluídas
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!permissoes.canEditTarefas}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors flex-shrink-0 ${
            permissoes.canEditTarefas
              ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {permissoes.canEditTarefas ? <Plus className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          Nova Tarefa
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      )}

      {/* Gantt Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Week headers */}
          <div className="flex border-b border-slate-200 pb-2 mb-3">
            <div className="w-64 flex-shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tarefa</div>
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
              {todayPct >= 0 && todayPct <= 100 && (
                <div className="absolute top-0 bottom-0 w-px bg-rose-400" style={{ left: `${todayPct}%` }}>
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
              // Use centralized Gantt calculations
              const leftPct = ganttPosition(start, minDate, totalDays);
              const widthPct = ganttWidth(start, end, totalDays);
              const depName = getDependenciaNome(tarefa.dependencia_id);
              const depConflict = checkDependencyConflict(tarefa);
              const displayProgress = progressDrafts[tarefa.id] ?? tarefa.percentual_concluido;

              return (
                <div key={tarefa.id} className="flex items-center group">
                  <div className="w-64 flex-shrink-0 pr-3">
                    <div className="flex items-center gap-1.5">
                      {depName && <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                      <span className="text-sm text-slate-700 truncate">{tarefa.nome}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <span className="text-xs text-slate-400">
                        {start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} -{' '}
                        {end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </span>
                      {depConflict && (
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                      )}
                    </div>
                    {depConflict && (
                      <p className="text-xs text-amber-500 mt-0.5">{depConflict}</p>
                    )}
                  </div>
                  <div className="flex-1 relative h-10">
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div className="absolute top-0 bottom-0 w-px bg-rose-200" style={{ left: `${todayPct}%` }} />
                    )}
                    <div
                      className="absolute top-1.5 h-7 rounded-lg overflow-hidden flex items-center shadow-sm"
                      style={{
                        left: `${leftPct}%`,
                        width: `${Math.max(widthPct, 1)}%`,
                        background:
                          tarefa.percentual_concluido === 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : tarefa.percentual_concluido > 0
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #94a3b8, #64748b)',
                      }}
                    >
                      <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${displayProgress}%` }} />
                      <span className="px-2 text-xs font-semibold text-white truncate relative z-10">{displayProgress}%</span>
                    </div>
                    {depName && (
                      <div className="absolute top-1.5 h-7 flex items-center" style={{ left: `${Math.max(0, leftPct - 2)}%` }}>
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
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-bold text-slate-800">Controle de Avanço</h3>
          {savedIndicator && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="w-3.5 h-3.5" /> Salvo
            </span>
          )}
        </div>
        <div className="space-y-4">
          {tarefas.map((tarefa) => {
            const displayProgress = progressDrafts[tarefa.id] ?? tarefa.percentual_concluido;
            return (
              <div key={tarefa.id} className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 truncate">{tarefa.nome}</span>
                    <span className="text-sm font-bold text-slate-800 ml-2 flex-shrink-0">{displayProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={displayProgress}
                    onChange={(e) => handleProgressChange(tarefa.id, parseFloat(e.target.value))}
                    disabled={!permissoes.canEditProgress}
                    className="w-full accent-emerald-500 disabled:opacity-50"
                  />
                </div>
                {tarefa.valor_previsto > 0 && permissoes.canSeeFinancial && (
                  <div className="text-right flex-shrink-0 w-32">
                    <p className="text-xs text-slate-400">Valor Previsto</p>
                    <p className="text-sm font-semibold text-slate-700">{formatBRL(tarefa.valor_previsto)}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showModal && renderModal()}
    </div>
  );
}
