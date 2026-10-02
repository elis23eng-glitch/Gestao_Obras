import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calculator,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Layers,
  FileText,
  Save,
  Lock,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac-context';
import { parseBR, formatBR, formatBRL, round2, custoComposicao, custoDireto as calcCustoDireto, valorBdi, precoVenda } from '@/lib/calc';
import type { Projeto, EapItem, Orcamento, OrcamentoItem, Composicao, ComposicaoInsumo } from '@/types/database';

interface OrcamentosProps {
  selectedProjetoId: string | null;
  onSelectProjeto: (id: string) => void;
}

export default function Orcamentos({ selectedProjetoId, onSelectProjeto }: OrcamentosProps) {
  const { permissoes } = useRbac();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [eapItens, setEapItens] = useState<EapItem[]>([]);
  const [orcamentoItens, setOrcamentoItens] = useState<OrcamentoItem[]>([]);
  const [composicoes, setComposicoes] = useState<Composicao[]>([]);
  const [composicaoInsumos, setComposicaoInsumos] = useState<Record<string, ComposicaoInsumo[]>>({});
  void composicaoInsumos;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [bdiInput, setBdiInput] = useState('0');
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ composicao_id: '', quantidade: '1' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showEapModal, setShowEapModal] = useState(false);
  const [eapForm, setEapForm] = useState({ codigo: '', nome: '', parent_id: '', nivel: '1' });
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

    const [projRes, eapRes, orcRes, compRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase.from('eap_itens').select('*').eq('projeto_id', projId).order('codigo', { ascending: true }),
      supabase.from('orcamentos').select('*').eq('projeto_id', projId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('composicoes').select('*').order('nome', { ascending: true }),
    ]);

    if (currentReq !== reqRef.current) return;

    if (projRes.error) { setError(projRes.error.message); setLoading(false); return; }

    setProjeto(projRes.data as Projeto);
    setEapItens((eapRes.data as EapItem[]) || []);
    setComposicoes((compRes.data as Composicao[]) || []);

    const orc = orcRes.data as Orcamento | null;
    setOrcamento(orc);
    if (orc) {
      setBdiInput(formatBR(orc.bdi_taxa));
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('*, eap_item:eap_itens(*), composicao:composicoes(*)')
        .eq('orcamento_id', orc.id);
      if (currentReq !== reqRef.current) return;
      setOrcamentoItens((itensData as OrcamentoItem[]) || []);

      // Fetch composicao_insumos for all composicoes used in items
      const compIds = new Set<string>();
      (itensData as OrcamentoItem[] || []).forEach(i => { if (i.composicao_id) compIds.add(i.composicao_id); });
      if (compIds.size > 0) {
        const { data: ciData } = await supabase
          .from('composicao_insumos')
          .select('*, insumo:insumos(*)')
          .in('composicao_id', Array.from(compIds));
        if (currentReq !== reqRef.current) return;
        const grouped: Record<string, ComposicaoInsumo[]> = {};
        (ciData as ComposicaoInsumo[] || []).forEach(ci => {
          if (!grouped[ci.composicao_id]) grouped[ci.composicao_id] = [];
          grouped[ci.composicao_id].push(ci);
        });
        setComposicaoInsumos(grouped);
      } else {
        setComposicaoInsumos({});
      }
    } else {
      setOrcamentoItens([]);
      setComposicaoInsumos({});
      setBdiInput('0');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedProjetoId) {
      setProjeto(null);
      setOrcamentoItens([]);
      setExpandedNodes(new Set());
      fetchData(selectedProjetoId);
    } else {
      setProjeto(null);
      setLoading(false);
    }
  }, [selectedProjetoId, fetchData]);

  useEffect(() => {
    if (eapItens.length > 0 && expandedNodes.size === 0) {
      const autoExpand = new Set<string>();
      eapItens.filter((e) => e.nivel <= 2).forEach((e) => autoExpand.add(e.id));
      setExpandedNodes(autoExpand);
    }
  }, [eapItens, expandedNodes.size]);

  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };



  // Ensure orcamento exists, create if not
  const ensureOrcamento = async (projId: string): Promise<Orcamento | null> => {
    if (orcamento) return orcamento;
    const { data, error: err } = await supabase
      .from('orcamentos')
      .insert({ projeto_id: projId, nome: 'Orçamento Principal', status: 'rascunho' })
      .select('*')
      .single();
    if (err) { setSaveError(err.message); return null; }
    setOrcamento(data as Orcamento);
    setBdiInput(String(data.bdi_taxa));
    return data as Orcamento;
  };

  const handleSaveBdi = async () => {
    if (!orcamento || !permissoes.canEditBdi) return;
    const newBdi = parseBR(bdiInput);
    if (newBdi < 0 || !isFinite(newBdi)) { setSaveError('BDI inválido'); return; }
    setSaving(true);
    setSaveError(null);
    const { error: err } = await supabase.from('orcamentos').update({ bdi_taxa: newBdi }).eq('id', orcamento.id);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setOrcamento({ ...orcamento, bdi_taxa: newBdi });
  };

  const handleAddItem = async (eapItemId: string) => {
    if (!selectedProjetoId || !newItem.composicao_id) return;
    const comp = composicoes.find((c) => c.id === newItem.composicao_id);
    if (!comp) return;

    const orc = await ensureOrcamento(selectedProjetoId);
    if (!orc) return;

    // Fetch insumos for this composicao to calculate unit cost
    const { data: ciData } = await supabase
      .from('composicao_insumos')
      .select('*, insumo:insumos(*)')
      .eq('composicao_id', newItem.composicao_id);
    const insumos = (ciData as ComposicaoInsumo[]) || [];
    const unitCost = custoComposicao(insumos.map(ci => ({ coeficiente: ci.coeficiente, custo_unitario: ci.insumo?.custo_unitario || 0 })));
    const qtd = parseBR(newItem.quantidade);

    if (qtd <= 0 || !isFinite(qtd)) { setSaveError('Quantidade inválida'); return; }

    const { error: err } = await supabase.from('orcamento_itens').insert({
      orcamento_id: orc.id,
      eap_item_id: eapItemId,
      composicao_id: newItem.composicao_id,
      descricao: comp.nome,
      quantidade: qtd,
      custo_unitario: unitCost,
    });

    if (err) { setSaveError(err.message); return; }

    // Update local state
    setComposicaoInsumos(prev => ({ ...prev, [newItem.composicao_id]: insumos }));
    setShowAddItem(null);
    setNewItem({ composicao_id: '', quantidade: '1' });
    fetchData(selectedProjetoId);
  };

  const handleUpdateItem = async (id: string, field: 'quantidade' | 'custo_unitario', value: string) => {
    const numValue = parseBR(value);
    if (numValue < 0 || !isFinite(numValue)) { setSaveError(`${field} inválido`); return; }
    if (field === 'quantidade' && numValue <= 0) { setSaveError('Quantidade deve ser maior que zero'); return; }

    const { error: err } = await supabase.from('orcamento_itens').update({ [field]: numValue }).eq('id', id);
    if (err) { setSaveError(err.message); return; }
    setOrcamentoItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: numValue } : item))
    );
  };

  const handleDeleteItem = async (id: string) => {
    const { error: err } = await supabase.from('orcamento_itens').delete().eq('id', id);
    if (err) { setSaveError(err.message); return; }
    setOrcamentoItens((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCreateEap = async () => {
    if (!selectedProjetoId || !eapForm.codigo || !eapForm.nome) return;
    const nivel = parseInt(eapForm.nivel) || 1;
    const { error: err } = await supabase.from('eap_itens').insert({
      projeto_id: selectedProjetoId,
      parent_id: eapForm.parent_id || null,
      codigo: eapForm.codigo,
      nome: eapForm.nome,
      nivel,
    });
    if (err) { setSaveError(err.message); return; }
    setShowEapModal(false);
    setEapForm({ codigo: '', nome: '', parent_id: '', nivel: '1' });
    fetchData(selectedProjetoId);
  };



  const buildTree = (items: EapItem[]): EapItem[] => {
    const map = new Map<string, EapItem>();
    const roots: EapItem[] = [];
    items.forEach((item) => map.set(item.id, { ...item, children: [] }));
    items.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id && map.has(item.parent_id)) {
        map.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  };

  const tree = buildTree(eapItens);
  const getItensForEap = (eapId: string) => orcamentoItens.filter((item) => item.eap_item_id === eapId);

  // Calculate using centralized lib
  const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
  const taxaBdi = orcamento?.bdi_taxa ?? 0;
  const vBdi = valorBdi(cd, taxaBdi);
  const pv = precoVenda(cd, taxaBdi);

  // EAP subtotals (only direct items, no double-counting from children)
  const getEapSubtotal = (eapId: string): number => {
    const itens = getItensForEap(eapId);
    return calcCustoDireto(itens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
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
        <button onClick={() => selectedProjetoId && fetchData(selectedProjetoId)} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-semibold">
          <RefreshCw className="w-4 h-4" /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!selectedProjetoId || !projeto) {
    if (projetos.length === 0) {
      return (
        <div className="text-center py-20">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">Nenhuma obra cadastrada</p>
          <p className="text-sm text-slate-400">Crie uma obra na aba "Obras" para começar a orçar.</p>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Selecione uma obra para visualizar o orçamento:</p>
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

  const renderEapNode = (node: EapItem, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const itens = getItensForEap(node.id);
    const subtotal = getEapSubtotal(node.id);

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 hover:bg-slate-50 rounded-lg group"
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.id)}
              className="p-1 hover:bg-slate-200 rounded flex-shrink-0"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            </button>
          ) : (
            <span className="w-6 flex-shrink-0" />
          )}
          <span
            className={`text-xs font-mono font-semibold flex-shrink-0 ${
              node.nivel === 1 ? 'text-emerald-600' : node.nivel === 2 ? 'text-blue-600' : 'text-slate-400'
            }`}
          >
            {node.codigo}
          </span>
          <span className={`text-sm flex-1 ${node.nivel === 1 ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
            {node.nome}
          </span>
          {subtotal > 0 && (
            <span className="text-xs font-semibold text-slate-500 flex-shrink-0">
              {formatBRL(subtotal)}
            </span>
          )}
          {permissoes.canEditOrcamento && (
            <button
              onClick={() => setShowAddItem(showAddItem === node.id ? null : node.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-emerald-100 rounded transition-opacity flex-shrink-0"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
            </button>
          )}
        </div>

        {showAddItem === node.id && (
          <div className="flex items-center gap-2 py-2 bg-emerald-50 rounded-lg px-3" style={{ marginLeft: `${depth * 20 + 28}px` }}>
            <select
              value={newItem.composicao_id}
              onChange={(e) => setNewItem({ ...newItem, composicao_id: e.target.value })}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-400"
            >
              <option value="">Selecione uma composição...</option>
              {composicoes.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} - {c.nome}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={newItem.quantidade}
              onChange={(e) => setNewItem({ ...newItem, quantidade: e.target.value })}
              className="w-20 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-400"
              placeholder="Qtd"
            />
            <button
              onClick={() => handleAddItem(node.id)}
              disabled={!newItem.composicao_id}
              className="px-3 py-1.5 bg-emerald-500 text-white rounded text-xs font-semibold disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}

        {itens.length > 0 && (
          <div className="space-y-1 mt-1" style={{ marginLeft: `${depth * 20 + 28}px` }}>
            {itens.map((item) => {
              const total = round2(item.quantidade * item.custo_unitario);
              return (
                <div key={item.id} className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 rounded-lg border border-slate-100">
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-600 flex-1 truncate">
                    {item.composicao?.codigo} - {item.descricao || item.composicao?.nome}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatBR(item.quantidade)}
                    onChange={(e) => handleUpdateItem(item.id, 'quantidade', e.target.value)}
                    disabled={!permissoes.canEditOrcamento}
                    className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-right focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs text-slate-400">×</span>
                  <span className="text-xs text-slate-400 w-8">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formatBR(item.custo_unitario)}
                    onChange={(e) => handleUpdateItem(item.id, 'custo_unitario', e.target.value)}
                    disabled={!permissoes.canEditOrcamento}
                    className="w-24 px-2 py-1 text-xs border border-slate-200 rounded text-right focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <span className="text-xs font-semibold text-slate-700 w-24 text-right">{formatBRL(total)}</span>
                  {permissoes.canEditOrcamento && (
                    <button onClick={() => handleDeleteItem(item.id)} className="p-1 hover:bg-rose-100 rounded text-rose-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {isExpanded && hasChildren && (
          <div>{node.children!.map((child) => renderEapNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Project selector + BDI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Obra Selecionada</span>
          </div>
          <select
            value={selectedProjetoId || ''}
            onChange={(e) => onSelectProjeto(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-400"
          >
            {projetos.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          {orcamento && (
            <div className="mt-2 flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                orcamento.status === 'aprovado' ? 'bg-emerald-50 text-emerald-700' :
                orcamento.status === 'revisao' ? 'bg-amber-50 text-amber-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {orcamento.status === 'rascunho' ? 'Rascunho' : orcamento.status === 'revisao' ? 'Em Revisão' : 'Aprovado'}
              </span>
              <span className="text-xs text-slate-400">Versão: {new Date(orcamento.created_at || Date.now()).toLocaleDateString('pt-BR')}</span>
            </div>
          )}
        </div>

        {/* BDI Calculator */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Taxa de BDI</span>
            {!permissoes.canEditBdi && (
              <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/30">
                <Lock className="w-3 h-3" /> Bloqueado
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={bdiInput}
              onChange={(e) => setBdiInput(e.target.value)}
              disabled={!permissoes.canEditBdi}
              className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-white focus:outline-none focus:border-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-400">%</span>
            {permissoes.canEditBdi ? (
              <button
                onClick={handleSaveBdi}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 rounded-lg text-xs font-semibold"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Aplicar
              </button>
            ) : (
              <span className="text-xs text-slate-500">Definido pelo Admin</span>
            )}
          </div>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <p className="text-sm text-rose-600">{saveError}</p>
          <button onClick={() => setSaveError(null)} className="ml-auto text-rose-400 hover:text-rose-600">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 mb-1">Custos Diretos</p>
          <p className="text-2xl font-bold text-slate-800">{formatBRL(cd)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 mb-1">Valor do BDI ({formatBR(taxaBdi)}%)</p>
          <p className="text-2xl font-bold text-amber-600">{formatBRL(vBdi)}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white">
          <p className="text-xs text-emerald-100 mb-1">Preço de Venda</p>
          <p className="text-2xl font-bold">{formatBRL(pv)}</p>
        </div>
      </div>

      {/* EAP + Items */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-800">Estrutura Analítica do Projeto (EAP)</h3>
            <p className="text-xs text-slate-500">Vincule composições aos itens folha da EAP</p>
          </div>
          {permissoes.canEditOrcamento && (
            <button
              onClick={() => setShowEapModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-semibold text-slate-700"
            >
              <Plus className="w-3.5 h-3.5" /> Item EAP
            </button>
          )}
        </div>
        {eapItens.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Layers className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">EAP vazia.</p>
            <p className="text-xs mt-1">Crie itens da EAP para vincular composições e quantidades.</p>
          </div>
        ) : (
          <div className="border border-slate-100 rounded-xl p-3 max-h-[600px] overflow-y-auto">
            {tree.map((node) => renderEapNode(node))}
          </div>
        )}
      </div>

      {/* EAP Modal */}
      {showEapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Novo Item EAP</h3>
              <button onClick={() => setShowEapModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <RefreshCw className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Código *</label>
                  <input
                    type="text"
                    value={eapForm.codigo}
                    onChange={(e) => setEapForm({ ...eapForm, codigo: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="Ex: 1.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nível</label>
                  <select
                    value={eapForm.nivel}
                    onChange={(e) => setEapForm({ ...eapForm, nivel: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nome *</label>
                <input
                  type="text"
                  value={eapForm.nome}
                  onChange={(e) => setEapForm({ ...eapForm, nome: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  placeholder="Ex: Fundações"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Item Pai</label>
                <select
                  value={eapForm.parent_id}
                  onChange={(e) => setEapForm({ ...eapForm, parent_id: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                >
                  <option value="">Nenhum (item raiz)</option>
                  {eapItens.map((e) => (
                    <option key={e.id} value={e.id}>{e.codigo} - {e.nome}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowEapModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50">
                Cancelar
              </button>
              <button
                onClick={handleCreateEap}
                disabled={!eapForm.codigo || !eapForm.nome}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
              >
                Criar Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
