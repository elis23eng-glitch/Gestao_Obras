import { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  Plus,
  X,
  Layers,
  TrendingDown,
  Award,
  AlertCircle,
  Boxes,
  Wrench,
  HardHat,
  Truck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Insumo, Composicao, ComposicaoInsumo, Fornecedor, PropostaFornecedor } from '@/types/database';

type Tab = 'insumos' | 'composicoes' | 'equalizacao';

const tipoConfig: Record<Insumo['tipo'], { label: string; icon: typeof Boxes; color: string }> = {
  material: { label: 'Material', icon: Boxes, color: 'bg-blue-50 text-blue-600' },
  mao_obra: { label: 'Mão de Obra', icon: HardHat, color: 'bg-emerald-50 text-emerald-600' },
  equipamento: { label: 'Equipamento', icon: Wrench, color: 'bg-amber-50 text-amber-600' },
  servico: { label: 'Serviço', icon: Truck, color: 'bg-violet-50 text-violet-600' },
};

export default function Insumos() {
  const [tab, setTab] = useState<Tab>('insumos');
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [composicoes, setComposicoes] = useState<Composicao[]>([]);
  const [composicaoInsumos, setComposicaoInsumos] = useState<ComposicaoInsumo[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [propostas, setPropostas] = useState<PropostaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInsumoModal, setShowInsumoModal] = useState(false);
  const [selectedComposicao, setSelectedComposicao] = useState<string | null>(null);
  const [insumoForm, setInsumoForm] = useState({
    codigo: '',
    nome: '',
    unidade: '',
    custo_unitario: '',
    origem: 'SINAPI' as 'SINAPI' | 'Proprio',
    tipo: 'material' as Insumo['tipo'],
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [insRes, compRes, fornRes, propRes] = await Promise.all([
      supabase.from('insumos').select('*').order('codigo', { ascending: true }),
      supabase.from('composicoes').select('*').order('codigo', { ascending: true }),
      supabase.from('fornecedores').select('*').order('nome', { ascending: true }),
      supabase
        .from('propostas_fornecedor')
        .select('*, insumo:insumos(*), fornecedor:fornecedores(*)')
        .order('insumo_id', { ascending: true }),
    ]);
    setInsumos((insRes.data as Insumo[]) || []);
    setComposicoes((compRes.data as Composicao[]) || []);
    setFornecedores((fornRes.data as Fornecedor[]) || []);
    setPropostas((propRes.data as PropostaFornecedor[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const fetchComposicaoInsumos = useCallback(async (compId: string) => {
    const { data } = await supabase
      .from('composicao_insumos')
      .select('*, insumo:insumos(*)')
      .eq('composicao_id', compId);
    setComposicaoInsumos((data as ComposicaoInsumo[]) || []);
  }, []);

  useEffect(() => {
    if (selectedComposicao) fetchComposicaoInsumos(selectedComposicao);
  }, [selectedComposicao, fetchComposicaoInsumos]);

  const handleCreateInsumo = async () => {
    if (!insumoForm.codigo || !insumoForm.nome || !insumoForm.unidade) return;
    await supabase.from('insumos').insert({
      codigo: insumoForm.codigo,
      nome: insumoForm.nome,
      unidade: insumoForm.unidade,
      custo_unitario: parseFloat(insumoForm.custo_unitario) || 0,
      origem: insumoForm.origem,
      tipo: insumoForm.tipo,
    });
    setShowInsumoModal(false);
    setInsumoForm({ codigo: '', nome: '', unidade: '', custo_unitario: '', origem: 'SINAPI', tipo: 'material' });
    fetchAll();
  };

  const filteredInsumos = insumos.filter(
    (i) =>
      i.nome.toLowerCase().includes(search.toLowerCase()) ||
      i.codigo.toLowerCase().includes(search.toLowerCase())
  );

  // Equalização: group propostas by insumo
  const propostasPorInsumo = new Map<string, PropostaFornecedor[]>();
  propostas.forEach((p) => {
    if (!p.insumo) return;
    const list = propostasPorInsumo.get(p.insumo_id) || [];
    list.push(p);
    propostasPorInsumo.set(p.insumo_id, list);
  });

  const getMenorPreco = (insumoId: string) => {
    const list = propostasPorInsumo.get(insumoId) || [];
    if (list.length === 0) return null;
    return Math.min(...list.map((p) => p.preco));
  };

  const getMediaPreco = (insumoId: string) => {
    const list = propostasPorInsumo.get(insumoId) || [];
    if (list.length === 0) return null;
    return list.reduce((sum, p) => sum + p.preco, 0) / list.length;
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
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {(
          [
            { id: 'insumos' as Tab, label: 'Insumos', icon: Package },
            { id: 'composicoes' as Tab, label: 'Composições (CPU)', icon: Layers },
            { id: 'equalizacao' as Tab, label: 'Equalização de Propostas', icon: TrendingDown },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Insumos */}
      {tab === 'insumos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código ou nome..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
            </div>
            <button
              onClick={() => setShowInsumoModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Novo Insumo
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Código</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nome</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Unidade</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Custo Unit.</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInsumos.map((insumo) => {
                    const tc = tipoConfig[insumo.tipo];
                    const TIcon = tc.icon;
                    return (
                      <tr key={insumo.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-slate-600">{insumo.codigo}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{insumo.nome}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${tc.color}`}>
                            <TIcon className="w-3 h-3" />
                            {tc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500">{insumo.unidade}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700 text-right">
                          {insumo.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                              insumo.origem === 'SINAPI'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {insumo.origem === 'SINAPI' ? 'SINAPI' : 'Próprio'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Composições */}
      {tab === 'composicoes' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="font-bold text-slate-800 text-sm">Composições de Custo Unitário</h3>
            {composicoes.map((comp) => {
              const insumosCount = selectedComposicao === comp.id ? composicaoInsumos.length : 0;
              return (
                <button
                  key={comp.id}
                  onClick={() => setSelectedComposicao(comp.id)}
                  className={`w-full text-left bg-white rounded-xl border p-4 transition-all ${
                    selectedComposicao === comp.id
                      ? 'border-emerald-400 ring-1 ring-emerald-400'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-emerald-600">{comp.codigo}</span>
                        <span className="text-sm font-semibold text-slate-800 truncate">{comp.nome}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Unidade: {comp.unidade}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            {selectedComposicao ? (
              <>
                <h3 className="font-bold text-slate-800 mb-4">Insumos da Composição</h3>
                <div className="space-y-2">
                  {composicaoInsumos.length === 0 && (
                    <p className="text-sm text-slate-400">Nenhum insumo vinculado.</p>
                  )}
                  {composicaoInsumos.map((ci) => {
                    if (!ci.insumo) return null;
                    const custo = ci.coeficiente * ci.insumo.custo_unitario;
                    return (
                      <div
                        key={ci.id}
                        className="flex items-center gap-3 py-2.5 px-3 bg-slate-50 rounded-lg border border-slate-100"
                      >
                        <span className="text-xs font-mono text-slate-500 w-16 flex-shrink-0">
                          {ci.insumo.codigo}
                        </span>
                        <span className="text-sm text-slate-700 flex-1 truncate">{ci.insumo.nome}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          {ci.coeficiente} {ci.insumo.unidade}
                        </span>
                        <span className="text-xs text-slate-400">×</span>
                        <span className="text-xs text-slate-500 flex-shrink-0">
                          {ci.insumo.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                        <span className="text-sm font-semibold text-slate-800 w-24 text-right">
                          {custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {composicaoInsumos.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600">Custo Unitário Total</span>
                      <span className="text-lg font-bold text-emerald-600">
                        {composicaoInsumos
                          .reduce((sum, ci) => sum + ci.coeficiente * (ci.insumo?.custo_unitario || 0), 0)
                          .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                <Layers className="w-10 h-10 mb-3 text-slate-300" />
                <p className="text-sm">Selecione uma composição para ver os insumos</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Equalização de Propostas */}
      {tab === 'equalizacao' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Equalização de Propostas</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Compare os preços de {fornecedores.length} fornecedores para os mesmos insumos.
                O menor preço está destacado em verde e os valores acima da média em vermelho.
              </p>
            </div>
          </div>

          {/* Fornecedor headers */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Insumo</th>
                    {fornecedores.map((f) => (
                      <th key={f.id} className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[140px]">
                        {f.nome}
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Melhor Preço</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(propostasPorInsumo.keys()).map((insumoId) => {
                    const list = propostasPorInsumo.get(insumoId) || [];
                    const insumo = list[0]?.insumo;
                    if (!insumo) return null;
                    const menor = getMenorPreco(insumoId)!;
                    const media = getMediaPreco(insumoId)!;

                    return (
                      <tr key={insumoId} className="hover:bg-slate-50">
                        <td className="px-4 py-3 sticky left-0 bg-white">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-slate-500">{insumo.codigo}</span>
                            <span className="text-sm text-slate-700 truncate max-w-[200px]">{insumo.nome}</span>
                          </div>
                        </td>
                        {fornecedores.map((forn) => {
                          const proposta = list.find((p) => p.fornecedor_id === forn.id);
                          if (!proposta) {
                            return <td key={forn.id} className="px-4 py-3 text-right text-sm text-slate-300">-</td>;
                          }
                          const isMenor = proposta.preco === menor;
                          const isAcimaMedia = proposta.preco > media;
                          return (
                            <td key={forn.id} className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end">
                                <span
                                  className={`text-sm font-semibold ${
                                    isMenor ? 'text-emerald-600' : isAcimaMedia ? 'text-rose-500' : 'text-slate-600'
                                  }`}
                                >
                                  {proposta.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                                <span className="text-xs text-slate-400 mt-0.5">{proposta.prazo_entrega}</span>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Award className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm font-bold text-emerald-600">
                              {menor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resumo por fornecedor */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {fornecedores.map((forn) => {
              const propostasForn = propostas.filter((p) => p.fornecedor_id === forn.id);
              const vitorias = propostasForn.filter((p) => {
                const menor = getMenorPreco(p.insumo_id);
                return menor !== null && p.preco === menor;
              }).length;
              return (
                <div key={forn.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <h4 className="font-semibold text-slate-800 text-sm mb-1">{forn.nome}</h4>
                  <p className="text-xs text-slate-500 mb-3">{forn.contato} - {forn.telefone}</p>
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-emerald-600">{vitorias}</span>
                    <span className="text-xs text-slate-500">
                      {vitorias === 1 ? 'melhor preço' : 'melhores preços'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Novo Insumo */}
      {showInsumoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Novo Insumo</h3>
              <button onClick={() => setShowInsumoModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Código *</label>
                  <input
                    type="text"
                    value={insumoForm.codigo}
                    onChange={(e) => setInsumoForm({ ...insumoForm, codigo: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    placeholder="Ex: MAT021"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tipo</label>
                  <select
                    value={insumoForm.tipo}
                    onChange={(e) => setInsumoForm({ ...insumoForm, tipo: e.target.value as Insumo['tipo'] })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="material">Material</option>
                    <option value="mao_obra">Mão de Obra</option>
                    <option value="equipamento">Equipamento</option>
                    <option value="servico">Serviço</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={insumoForm.nome}
                  onChange={(e) => setInsumoForm({ ...insumoForm, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Nome do insumo"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Unidade *</label>
                  <input
                    type="text"
                    value={insumoForm.unidade}
                    onChange={(e) => setInsumoForm({ ...insumoForm, unidade: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="m², kg, un..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Custo Unit. (R$)</label>
                  <input
                    type="number"
                    value={insumoForm.custo_unitario}
                    onChange={(e) => setInsumoForm({ ...insumoForm, custo_unitario: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Origem</label>
                  <select
                    value={insumoForm.origem}
                    onChange={(e) => setInsumoForm({ ...insumoForm, origem: e.target.value as 'SINAPI' | 'Proprio' })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="SINAPI">SINAPI</option>
                    <option value="Proprio">Próprio</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowInsumoModal(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateInsumo}
                disabled={!insumoForm.codigo || !insumoForm.nome || !insumoForm.unidade}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                Criar Insumo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
