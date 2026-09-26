import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, X, Cloud, Users, AlertTriangle, FileText, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Projeto, DiarioObra } from '@/types/database';
import { useRbac } from '@/lib/rbac';

interface DiarioObraProps {
  selectedProjetoId: string | null;
  onSelectProjeto: (id: string) => void;
}

export default function DiarioObra({ selectedProjetoId, onSelectProjeto }: DiarioObraProps) {
  const { permissoes } = useRbac();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [registros, setRegistros] = useState<DiarioObra[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ data: '', clima: '', equipe: '', ocorrencias: '', impedimentos: '' });

  const fetchProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    setProjetos((data as Projeto[]) || []);
  }, []);

  const fetchData = useCallback(async (projId: string) => {
    setLoading(true);
    const [projRes, diarRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase
        .from('diario_obra')
        .select('*')
        .eq('projeto_id', projId)
        .order('data', { ascending: false }),
    ]);
    setProjeto(projRes.data as Projeto);
    setRegistros((diarRes.data as DiarioObra[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  useEffect(() => {
    if (selectedProjetoId) fetchData(selectedProjetoId);
  }, [selectedProjetoId, fetchData]);

  const handleCreate = async () => {
    if (!selectedProjetoId || !form.data) return;
    await supabase.from('diario_obra').insert({
      projeto_id: selectedProjetoId,
      data: form.data,
      clima: form.clima || null,
      equipe: form.equipe || null,
      ocorrencias: form.ocorrencias || null,
      impedimentos: form.impedimentos || null,
    });
    setShowModal(false);
    setForm({ data: '', clima: '', equipe: '', ocorrencias: '', impedimentos: '' });
    fetchData(selectedProjetoId);
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
        <p className="text-sm text-slate-500">Selecione uma obra para visualizar o diário:</p>
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800">{projeto.nome}</h3>
          <p className="text-xs text-slate-500">{registros.length} registros no diário</p>
        </div>
        {permissoes.canCreateDiario && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Novo Registro
          </button>
        )}
      </div>

      <div className="space-y-4">
        {registros.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p>Nenhum registro no diário de obra ainda.</p>
          </div>
        )}
        {registros.map((reg) => (
          <div key={reg.id} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {new Date(reg.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-slate-400">Diário de Obra</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {reg.clima && (
                <div className="flex items-start gap-2">
                  <Cloud className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Clima</p>
                    <p className="text-sm text-slate-700">{reg.clima}</p>
                  </div>
                </div>
              )}
              {reg.equipe && (
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Equipe</p>
                    <p className="text-sm text-slate-700">{reg.equipe}</p>
                  </div>
                </div>
              )}
              {reg.ocorrencias && (
                <div className="flex items-start gap-2 sm:col-span-2">
                  <FileText className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Ocorrências</p>
                    <p className="text-sm text-slate-700">{reg.ocorrencias}</p>
                  </div>
                </div>
              )}
              {reg.impedimentos && (
                <div className="flex items-start gap-2 sm:col-span-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Impedimentos</p>
                    <p className="text-sm text-slate-700">{reg.impedimentos}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Novo Registro de Diário</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data *</label>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Clima</label>
                  <input
                    type="text"
                    value={form.clima}
                    onChange={(e) => setForm({ ...form, clima: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    placeholder="Ex: Ensolarado, 28°C"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Equipe</label>
                  <input
                    type="text"
                    value={form.equipe}
                    onChange={(e) => setForm({ ...form, equipe: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    placeholder="Ex: 2 pedreiros + 1 servente"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ocorrências</label>
                <textarea
                  value={form.ocorrencias}
                  onChange={(e) => setForm({ ...form, ocorrencias: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 resize-none"
                  placeholder="Descreva as atividades realizadas..."
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Impedimentos</label>
                <textarea
                  value={form.impedimentos}
                  onChange={(e) => setForm({ ...form, impedimentos: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 resize-none"
                  placeholder="Houve algum impedimento?"
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
                disabled={!form.data}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                Salvar Registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
