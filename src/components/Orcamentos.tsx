import { useState, useEffect, useCallback } from 'react';
import {
  Calculator,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Layers,
  FileText,
  TrendingUp,
  Save,
  Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import type {
  Projeto,
  EapItem,
  Orcamento,
  OrcamentoItem,
  Composicao,
} from '@/types/database';

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
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [bdi, setBdi] = useState(25);
  const [bdiInput, setBdiInput] = useState('25');
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ composicao_id: '', quantidade: '1' });

  const fetchProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    setProjetos((data as Projeto[]) || []);
  }, []);

  const fetchData = useCallback(async (projId: string) => {
    setLoading(true);
    const [projRes, eapRes, orcRes, compRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase.from('eap_itens').select('*').eq('projeto_id', projId).order('codigo', { ascending: true }),
      supabase
        .from('orcamentos')
        .select('*')
        .eq('projeto_id', projId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('composicoes').select('*').order('nome', { ascending: true }),
    ]);

    setProjeto(projRes.data as Projeto);
    setEapItens((eapRes.data as EapItem[]) || []);
    setComposicoes((compRes.data as Composicao[]) || []);

    const orc = orcRes.data as Orcamento | null;
    setOrcamento(orc);
    if (orc) {
      setBdi(orc.bdi_taxa);
      setBdiInput(String(orc.bdi_taxa));
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('*, eap_item:eap_itens(*), composicao:composicoes(*)')
        .eq('orcamento_id', orc.id);
      setOrcamentoItens((itensData as OrcamentoItem[]) || []);
    } else {
      setOrcamentoItens([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  useEffect(() => {
    if (selectedProjetoId) {
      fetchData(selectedProjetoId);
      setExpandedNodes(new Set());
    }
  }, [selectedProjetoId, fetchData]);

  // Auto-expand all level 1 and 2 nodes
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

  const handleSaveBdi = async () => {
    const newBdi = parseFloat(bdiInput) || 0;
    setBdi(newBdi);
    if (orcamento) {
      await supabase.from('orcamentos').update({ bdi_taxa: newBdi }).eq('id', orcamento.id);
    }
  };

  const handleAddItem = async (eapItemId: string) => {
    if (!orcamento || !newItem.composicao_id) return;
    const comp = composicoes.find((c) => c.id === newItem.composicao_id);
    if (!comp) return;

    await supabase.from('orcamento_itens').insert({
      orcamento_id: orcamento.id,
      eap_item_id: eapItemId,
      composicao_id: newItem.composicao_id,
      descricao: comp.nome,
      quantidade: parseFloat(newItem.quantidade) || 1,
      custo_unitario: 0,
    });

    setShowAddItem(null);
    setNewItem({ composicao_id: '', quantidade: '1' });
    if (selectedProjetoId) fetchData(selectedProjetoId);
  };

  const handleUpdateItem = async (id: string, field: 'quantidade' | 'custo_unitario', value: string) => {
    const numValue = parseFloat(value) || 0;
    await supabase
      .from('orcamento_itens')
      .update({ [field]: numValue })
      .eq('id', id);
    setOrcamentoItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: numValue } : item))
    );
  };

  const handleDeleteItem = async (id: string) => {
    await supabase.from('orcamento_itens').delete().eq('id', id);
    setOrcamentoItens((prev) => prev.filter((item) => item.id !== id));
  };

  // Build tree
  const buildTree = (items: EapItem[]): EapItem[] => {
    const map = new Map<string, EapItem>();
    const roots: EapItem[] = [];
    items.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });
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

  const custoDireto = orcamentoItens.reduce(
    (sum, item) => sum + item.quantidade * item.custo_unitario,
    0
  );
  const custoIndireto = custoDireto * (bdi / 100);
  const precoVenda = custoDireto + custoIndireto;

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
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-500" />
              )}
            </button>
          ) : (
            <span className="w-6 flex-shrink-0" />
          )}
          <span
            className={`text-xs font-mono font-semibold flex-shrink-0 ${
              node.nivel === 1
                ? 'text-emerald-600'
                : node.nivel === 2
                ? 'text-blue-600'
                : 'text-slate-400'
            }`}
          >
            {node.codigo}
          </span>
          <span
            className={`text-sm flex-1 ${
              node.nivel === 1 ? 'font-bold text-slate-800' : 'text-slate-600'
            }`}
          >
            {node.nome}
          </span>
          {node.nivel === 3 && permissoes.canEditOrcamento && (
            <button
              onClick={() => setShowAddItem(showAddItem === node.id ? null : node.id)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-emerald-100 rounded transition-opacity flex-shrink-0"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
            </button>
          )}
        </div>

        {/* Add item form */}
        {showAddItem === node.id && (
          <div
            className="flex items-center gap-2 py-2 bg-emerald-50 rounded-lg px-3"
            style={{ marginLeft: `${depth * 20 + 28}px` }}
          >
            <select
              value={newItem.composicao_id}
              onChange={(e) => setNewItem({ ...newItem, composicao_id: e.target.value })}
              className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-emerald-400"
            >
              <option value="">Selecione uma composição...</option>
              {composicoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {c.nome}
                </option>
              ))}
            </select>
            <input
              type="number"
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

        {/* Items for this EAP node */}
        {itens.length > 0 && (
          <div
            className="space-y-1 mt-1"
            style={{ marginLeft: `${depth * 20 + 28}px` }}
          >
            {itens.map((item) => {
              const total = item.quantidade * item.custo_unitario;
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-2 py-1.5 px-3 bg-slate-50 rounded-lg border border-slate-100"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-600 flex-1 truncate">
                    {item.composicao?.codigo} - {item.descricao || item.composicao?.nome}
                  </span>
                  <input
                    type="number"
                    value={item.quantidade}
                    onChange={(e) => handleUpdateItem(item.id, 'quantidade', e.target.value)}
                    disabled={!permissoes.canEditOrcamento}
                    className="w-16 px-2 py-1 text-xs border border-slate-200 rounded text-right focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    step="0.01"
                  />
                  <span className="text-xs text-slate-400">×</span>
                  <span className="text-xs text-slate-400 w-8">R$</span>
                  <input
                    type="number"
                    value={item.custo_unitario}
                    onChange={(e) => handleUpdateItem(item.id, 'custo_unitario', e.target.value)}
                    disabled={!permissoes.canEditOrcamento}
                    className="w-20 px-2 py-1 text-xs border border-slate-200 rounded text-right focus:outline-none focus:border-emerald-400 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    step="0.01"
                  />
                  <span className="text-xs font-semibold text-slate-700 w-24 text-right">
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  {permissoes.canEditOrcamento && (
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1 hover:bg-rose-100 rounded text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Children */}
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
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        {/* BDI Calculator */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Calculadora BDI</span>
            {!permissoes.canEditBdi && (
              <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/30">
                <Lock className="w-3 h-3" />
                Bloqueado
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={bdiInput}
              onChange={(e) => setBdiInput(e.target.value)}
              disabled={!permissoes.canEditBdi}
              className="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-white focus:outline-none focus:border-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-400">%</span>
            {permissoes.canEditBdi ? (
              <button
                onClick={handleSaveBdi}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-xs font-semibold"
              >
                <Save className="w-3.5 h-3.5" />
                Aplicar
              </button>
            ) : (
              <span className="text-xs text-slate-500">Definido pelo Diretor</span>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 mb-1">Custos Diretos</p>
          <p className="text-2xl font-bold text-slate-800">
            {custoDireto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs text-slate-500 mb-1">Custos Indiretos (BDI {bdi}%)</p>
          <p className="text-2xl font-bold text-amber-600">
            {custoIndireto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white">
          <p className="text-xs text-emerald-100 mb-1">Preço de Venda</p>
          <p className="text-2xl font-bold">
            {precoVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      {/* EAP + Items */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-800">Estrutura Analítica do Projeto (EAP)</h3>
            <p className="text-xs text-slate-500">Vincule composições aos itens folha da EAP</p>
          </div>
          <TrendingUp className="w-5 h-5 text-emerald-500" />
        </div>
        <div className="border border-slate-100 rounded-xl p-3 max-h-[600px] overflow-y-auto">
          {tree.map((node) => renderEapNode(node))}
        </div>
      </div>
    </div>
  );
}
