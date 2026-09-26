import { useState, useEffect, useCallback } from 'react';
import { Building2, MapPin, Calendar, Plus, ArrowRight, X, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Projeto } from '@/types/database';

interface ObrasProps {
  onSelectProjeto: (id: string) => void;
}

const statusConfig: Record<Projeto['status'], { label: string; color: string; dot: string }> = {
  planejamento: { label: 'Planejamento', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  em_andamento: { label: 'Em Andamento', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  pausado: { label: 'Pausado', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  concluido: { label: 'Concluído', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  cancelado: { label: 'Cancelado', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export default function Obras({ onSelectProjeto }: ObrasProps) {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    cliente: '',
    endereco: '',
    data_inicio: '',
    data_termino: '',
    valor_contrato: '',
  });

  const fetchProjetos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projetos')
      .select('*')
      .order('created_at', { ascending: false });
    setProjetos((data as Projeto[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  const handleCreate = async () => {
    if (!form.nome || !form.cliente) return;
    await supabase.from('projetos').insert({
      nome: form.nome,
      cliente: form.cliente,
      endereco: form.endereco || null,
      data_inicio: form.data_inicio || null,
      data_termino: form.data_termino || null,
      valor_contrato: form.valor_contrato ? parseFloat(form.valor_contrato) : 0,
      status: 'planejamento',
    });
    setShowModal(false);
    setForm({ nome: '', cliente: '', endereco: '', data_inicio: '', data_termino: '', valor_contrato: '' });
    fetchProjetos();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {projetos.length} {projetos.length === 1 ? 'obra cadastrada' : 'obras cadastradas'}
        </p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Obra
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {projetos.map((proj) => {
          const sc = statusConfig[proj.status];
          return (
            <div
              key={proj.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg hover:border-emerald-300 transition-all cursor-pointer group"
              onClick={() => onSelectProjeto(proj.id)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${sc.color} flex items-center gap-1.5`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
              </div>

              <h3 className="font-bold text-slate-800 mb-1 line-clamp-2 group-hover:text-emerald-600 transition-colors">
                {proj.nome}
              </h3>
              <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
                <User className="w-3.5 h-3.5" />
                {proj.cliente}
              </div>

              {proj.endereco && (
                <div className="flex items-start gap-1.5 text-xs text-slate-400 mb-4">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span className="line-clamp-2">{proj.endereco}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div>
                  {proj.data_inicio && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(proj.data_inicio).toLocaleDateString('pt-BR')}
                      {proj.data_termino && ` - ${new Date(proj.data_termino).toLocaleDateString('pt-BR')}`}
                    </div>
                  )}
                  <p className="text-lg font-bold text-slate-800 mt-1">
                    R$ {proj.valor_contrato.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-emerald-500 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {projetos.length === 0 && (
        <div className="text-center py-20">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-4">Nenhuma obra cadastrada ainda.</p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Criar primeira obra
          </button>
        </div>
      )}

      {/* Modal Nova Obra */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Nova Obra</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome da Obra *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Ex: Reforma Apto Centro"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cliente *</label>
                <input
                  type="text"
                  value={form.cliente}
                  onChange={(e) => setForm({ ...form, cliente: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Nome do cliente"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Endereço</label>
                <input
                  type="text"
                  value={form.endereco}
                  onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Endereço completo"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Início</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Término</label>
                  <input
                    type="date"
                    value={form.data_termino}
                    onChange={(e) => setForm({ ...form, data_termino: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Valor do Contrato (R$)</label>
                <input
                  type="number"
                  value={form.valor_contrato}
                  onChange={(e) => setForm({ ...form, valor_contrato: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
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
                disabled={!form.nome || !form.cliente}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                Criar Obra
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
