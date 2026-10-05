import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShoppingCart,
  Plus,
  X,
  Search,
  Download,
  Upload,
  FileText,
  TrendingDown,
  Award,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Trash2,
  Pencil,
  ChevronRight,
  Store,
  Filter,
  Info,
  Paperclip,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import { formatBRL, round2, parseBR } from '@/lib/calc';
import type { Projeto, Fornecedor, SolicitacaoCompra, Proposta, PropostaItem } from '@/types/database';

interface ComprasProps {
  selectedProjetoId: string | null;
  onSelectProjeto: (id: string) => void;
}

type SubView = 'solicitacoes' | 'propostas' | 'equalizacao';

const categoriaConfig: Record<string, { label: string; color: string }> = {
  material: { label: 'Material', color: 'bg-blue-50 text-blue-600' },
  servico: { label: 'Serviço', color: 'bg-violet-50 text-violet-600' },
  mao_obra: { label: 'Mão de Obra', color: 'bg-emerald-50 text-emerald-600' },
  equipamento: { label: 'Equipamento', color: 'bg-amber-50 text-amber-600' },
};

const statusSolicitacaoConfig: Record<string, { label: string; color: string }> = {
  aberta: { label: 'Aberta', color: 'bg-blue-50 text-blue-600' },
  cotando: { label: 'Cotando', color: 'bg-amber-50 text-amber-600' },
  aprovada: { label: 'Aprovada', color: 'bg-emerald-50 text-emerald-600' },
  cancelada: { label: 'Cancelada', color: 'bg-rose-50 text-rose-600' },
  entregue: { label: 'Entregue', color: 'bg-slate-100 text-slate-600' },
};

const statusPropostaConfig: Record<string, { label: string; color: string }> = {
  recebida: { label: 'Recebida', color: 'bg-blue-50 text-blue-600' },
  em_analise: { label: 'Em Análise', color: 'bg-amber-50 text-amber-600' },
  aprovada: { label: 'Aprovada', color: 'bg-emerald-50 text-emerald-600' },
  rejeitada: { label: 'Rejeitada', color: 'bg-rose-50 text-rose-600' },
  vencida: { label: 'Vencida', color: 'bg-slate-100 text-slate-500' },
};

function calcPropostaTotal(itens: PropostaItem[], frete: number, impostos: number, descontoGlobal: number): number {
  const subtotalItens = itens.reduce((sum, item) => {
    const li = item.quantidade * item.preco_unitario;
    const desc = li * (item.desconto / 100);
    return sum + (li - desc);
  }, 0);
  return round2(subtotalItens + frete + impostos - descontoGlobal);
}

function isPropostaVencida(validade: string | null): boolean {
  if (!validade) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const v = new Date(validade);
  v.setHours(0, 0, 0, 0);
  return v < today;
}

export default function Compras({ selectedProjetoId, onSelectProjeto }: ComprasProps) {
  const { permissoes } = useRbac();
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetosMap, setProjetosMap] = useState<Record<string, string>>({});
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoCompra[]>([]);
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState<SubView>('solicitacoes');
  const [selectedSolicitacaoId, setSelectedSolicitacaoId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modals
  const [showSolicitacaoModal, setShowSolicitacaoModal] = useState(false);
  const [editingSolicitacao, setEditingSolicitacao] = useState<SolicitacaoCompra | null>(null);
  const [showPropostaModal, setShowPropostaModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAprovacaoModal, setShowAprovacaoModal] = useState<Proposta | null>(null);

  // Forms
  const [solicitacaoForm, setSolicitacaoForm] = useState({
    descricao: '',
    categoria: 'material' as SolicitacaoCompra['categoria'],
    insumo_id: '',
    unidade: 'un',
    quantidade: '1',
    data_necessaria: '',
    orcamento_referencia: '',
  });
  const [propostaForm, setPropostaForm] = useState({
    fornecedor_id: '',
    numero: '',
    data_proposta: new Date().toISOString().slice(0, 10),
    validade: '',
    prazo_entrega: '',
    condicao_pagamento: '',
    frete: '0',
    impostos_adicionais: '0',
    desconto_global: '0',
    observacoes: '',
  });
  const [propostaItens, setPropostaItens] = useState<{ descricao: string; unidade: string; quantidade: string; preco_unitario: string; desconto: string }[]>([
    { descricao: '', unidade: 'un', quantidade: '1', preco_unitario: '0', desconto: '0' },
  ]);
  const [aprovacaoJustificativa, setAprovacaoJustificativa] = useState('');
  const [aprovacaoEconomia, setAprovacaoEconomia] = useState('');

  // Import state
  const [importData, setImportData] = useState<{ rows: ImportRow[]; errors: string[]; hash: string } | null>(null);
  const [importSolicitacaoId, setImportSolicitacaoId] = useState<string>('');
  const [importFornecedorId, setImportFornecedorId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  interface ImportRow {
    descricao: string;
    unidade: string;
    quantidade: string;
    preco_unitario: string;
    desconto: string;
    errors: string[];
  }

  const fetchProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    const projs = (data as Projeto[]) || [];
    setProjetos(projs);
    const map: Record<string, string> = {};
    projs.forEach((p) => { map[p.id] = p.nome; });
    setProjetosMap(map);
  }, []);

  useEffect(() => {
    fetchProjetos();
  }, [fetchProjetos]);

  const fetchData = useCallback(async () => {
    if (!selectedProjetoId) { setLoading(false); return; }
    setLoading(true);
    const [soliRes, propRes, fornRes] = await Promise.all([
      supabase.from('solicitacoes_compra').select('*, insumo:insumos(*)').eq('projeto_id', selectedProjetoId).order('created_at', { ascending: false }),
      supabase.from('propostas').select('*, fornecedor:fornecedores(*), solicitacao:solicitacoes_compra(*), itens:proposta_itens(*)').eq('projeto_id', selectedProjetoId).order('created_at', { ascending: false }),
      supabase.from('fornecedores').select('*').eq('ativo', true).order('nome', { ascending: true }),
    ]);
    setSolicitacoes((soliRes.data as SolicitacaoCompra[]) || []);
    setPropostas((propRes.data as Proposta[]) || []);
    setFornecedores((fornRes.data as Fornecedor[]) || []);
    setLoading(false);
  }, [selectedProjetoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Solicitacoes
  const resetSolicitacaoForm = () => {
    setSolicitacaoForm({ descricao: '', categoria: 'material', insumo_id: '', unidade: 'un', quantidade: '1', data_necessaria: '', orcamento_referencia: '' });
    setEditingSolicitacao(null);
  };

  const handleSaveSolicitacao = async () => {
    if (!selectedProjetoId || !solicitacaoForm.descricao.trim()) return;
    const payload = {
      projeto_id: selectedProjetoId,
      descricao: solicitacaoForm.descricao.trim(),
      categoria: solicitacaoForm.categoria,
      insumo_id: solicitacaoForm.insumo_id || null,
      unidade: solicitacaoForm.unidade,
      quantidade: parseFloat(solicitacaoForm.quantidade) || 1,
      data_necessaria: solicitacaoForm.data_necessaria || null,
      orcamento_referencia: solicitacaoForm.orcamento_referencia ? parseBR(solicitacaoForm.orcamento_referencia) : null,
    };
    if (editingSolicitacao) {
      await supabase.from('solicitacoes_compra').update(payload).eq('id', editingSolicitacao.id);
    } else {
      await supabase.from('solicitacoes_compra').insert(payload);
    }
    setShowSolicitacaoModal(false);
    resetSolicitacaoForm();
    fetchData();
  };

  const handleDeleteSolicitacao = async (id: string) => {
    await supabase.from('solicitacoes_compra').delete().eq('id', id);
    fetchData();
  };

  // Propostas
  const resetPropostaForm = () => {
    setPropostaForm({
      fornecedor_id: '',
      numero: '',
      data_proposta: new Date().toISOString().slice(0, 10),
      validade: '',
      prazo_entrega: '',
      condicao_pagamento: '',
      frete: '0',
      impostos_adicionais: '0',
      desconto_global: '0',
      observacoes: '',
    });
    setPropostaItens([{ descricao: '', unidade: 'un', quantidade: '1', preco_unitario: '0', desconto: '0' }]);
  };

  const handleSaveProposta = async () => {
    if (!selectedProjetoId || !selectedSolicitacaoId || !propostaForm.fornecedor_id) return;
    const validItens = propostaItens.filter((i) => i.descricao.trim());
    if (validItens.length === 0) return;

    const hash = `${selectedProjetoId}-${selectedSolicitacaoId}-${propostaForm.fornecedor_id}-${propostaForm.numero}-${Date.now()}`;
    const { data: propData, error: propError } = await supabase.from('propostas').insert({
      projeto_id: selectedProjetoId,
      solicitacao_id: selectedSolicitacaoId,
      fornecedor_id: propostaForm.fornecedor_id,
      numero: propostaForm.numero || null,
      data_proposta: propostaForm.data_proposta || null,
      validade: propostaForm.validade || null,
      prazo_entrega: propostaForm.prazo_entrega || null,
      condicao_pagamento: propostaForm.condicao_pagamento || null,
      frete: parseBR(propostaForm.frete) || 0,
      impostos_adicionais: parseBR(propostaForm.impostos_adicionais) || 0,
      desconto_global: parseBR(propostaForm.desconto_global) || 0,
      observacoes: propostaForm.observacoes || null,
      status: 'recebida',
      import_hash: hash,
    }).select().single();

    if (propError || !propData) return;

    const itensToInsert = validItens.map((item, idx) => ({
      proposta_id: propData.id,
      descricao: item.descricao.trim(),
      unidade: item.unidade,
      quantidade: parseBR(item.quantidade) || 1,
      preco_unitario: parseBR(item.preco_unitario) || 0,
      desconto: parseBR(item.desconto) || 0,
      ordem: idx,
    }));
    await supabase.from('proposta_itens').insert(itensToInsert);

    // Update solicitacao status to 'cotando'
    await supabase.from('solicitacoes_compra').update({ status: 'cotando' }).eq('id', selectedSolicitacaoId);

    setShowPropostaModal(false);
    resetPropostaForm();
    fetchData();
  };

  const handleDeleteProposta = async (id: string) => {
    await supabase.from('propostas').delete().eq('id', id);
    fetchData();
  };

  // Aprovação
  const handleAprovarProposta = async () => {
    if (!showAprovacaoModal || !aprovacaoJustificativa.trim()) return;
    const proposta = showAprovacaoModal;
    const total = calcPropostaTotal(proposta.itens || [], proposta.frete, proposta.impostos_adicionais, proposta.desconto_global);
    const economia = aprovacaoEconomia ? parseBR(aprovacaoEconomia) : null;

    await supabase.from('compra_aprovacoes').insert({
      proposta_id: proposta.id,
      justificativa: aprovacaoJustificativa.trim(),
      custo_total_aprovado: total,
      economia_aprovada: economia,
    });
    await supabase.from('propostas').update({ status: 'aprovada' }).eq('id', proposta.id);
    await supabase.from('solicitacoes_compra').update({ status: 'aprovada' }).eq('id', proposta.solicitacao_id);

    setShowAprovacaoModal(null);
    setAprovacaoJustificativa('');
    setAprovacaoEconomia('');
    fetchData();
  };

  const handleRejeitarProposta = async (proposta: Proposta) => {
    await supabase.from('propostas').update({ status: 'rejeitada' }).eq('id', proposta.id);
    fetchData();
  };

  // PDF upload
  const handlePdfUpload = async (proposta: Proposta, file: File) => {
    const filePath = `${proposta.projeto_id}/${proposta.id}/${file.name}`;
    const { error: upErr } = await supabase.storage
      .from('propostas-pdfs')
      .upload(filePath, file, { upsert: true });
    if (upErr) return;
    await supabase.from('propostas').update({ pdf_path: filePath }).eq('id', proposta.id);
    fetchData();
  };

  const handlePdfDownload = async (proposta: Proposta) => {
    if (!proposta.pdf_path) return;
    const { data, error } = await supabase.storage.from('propostas-pdfs').createSignedUrl(proposta.pdf_path, 300);
    if (error || !data?.signedUrl) return;
    window.open(data.signedUrl, '_blank');
  };

  // CSV Import
  const downloadCsvTemplate = () => {
    const csv = 'descricao;unidade;quantidade;preco_unitario;desconto\nCimento Votoran 50kg;saco;100;28,50;0\nAreia média;m³;5;85,00;5\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_propostas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string): ImportRow[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const delimiter = lines[0].includes(';') ? ';' : ',';
    const hasHeader = /descricao|descrição|unid|quant|pre[cç]o|desc/i.test(lines[0]);
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line, idx) => {
      const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      const errors: string[] = [];
      const descricao = cols[0] || '';
      const unidade = cols[1] || 'un';
      const quantidade = cols[2] || '1';
      const preco = cols[3] || '0';
      const desconto = cols[4] || '0';

      if (!descricao) errors.push('Descrição obrigatória');
      const qtd = parseBR(quantidade);
      if (qtd <= 0) errors.push('Quantidade deve ser maior que zero');
      const precoNum = parseBR(preco);
      if (precoNum < 0) errors.push('Preço inválido');
      const descNum = parseBR(desconto);
      if (descNum < 0 || descNum > 100) errors.push('Desconto deve estar entre 0 e 100');

      return { descricao, unidade, quantidade, preco_unitario: preco, desconto, errors };
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      const hasErrors = rows.some((r) => r.errors.length > 0);
      const hash = `${file.name}-${file.size}-${file.lastModified}`;
      setImportData({ rows, errors: hasErrors ? ['Há erros em uma ou mais linhas'] : [], hash });
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleConfirmImport = async () => {
    if (!importData || !selectedProjetoId || !importSolicitacaoId || !importFornecedorId) return;
    if (importData.rows.some((r) => r.errors.length > 0)) return;

    // Check for duplicate import (same hash + solicitacao + fornecedor)
    const { data: existing } = await supabase
      .from('propostas')
      .select('id')
      .eq('import_hash', importData.hash)
      .maybeSingle();
    if (existing) {
      setImportData({ ...importData, errors: ['Este arquivo já foi importado anteriormente.'] });
      return;
    }

    const { data: propData, error: propError } = await supabase.from('propostas').insert({
      projeto_id: selectedProjetoId,
      solicitacao_id: importSolicitacaoId,
      fornecedor_id: importFornecedorId,
      status: 'recebida',
      import_hash: importData.hash,
    }).select().single();

    if (propError || !propData) return;

    const itensToInsert = importData.rows.map((row, idx) => ({
      proposta_id: propData.id,
      descricao: row.descricao,
      unidade: row.unidade,
      quantidade: parseBR(row.quantidade),
      preco_unitario: parseBR(row.preco_unitario),
      desconto: parseBR(row.desconto),
      ordem: idx,
    }));
    await supabase.from('proposta_itens').insert(itensToInsert);
    await supabase.from('solicitacoes_compra').update({ status: 'cotando' }).eq('id', importSolicitacaoId);

    setShowImportModal(false);
    setImportData(null);
    setImportSolicitacaoId('');
    setImportFornecedorId('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchData();
  };

  // Filtered data
  const propostasDaSolicitacao = propostas.filter((p) => !selectedSolicitacaoId || p.solicitacao_id === selectedSolicitacaoId);
  const solicitacoesFiltered = solicitacoes.filter(
    (s) => s.descricao.toLowerCase().includes(search.toLowerCase())
  );

  // Equalização: compare propostas for selected solicitacao
  const propostasParaComparar = propostas.filter(
    (p) => p.solicitacao_id === selectedSolicitacaoId && p.itens
  ).map((p) => ({
    ...p,
    total: calcPropostaTotal(p.itens || [], p.frete, p.impostos_adicionais, p.desconto_global),
    vencida: isPropostaVencida(p.validade),
  }));

  const propostaAprovada = propostasParaComparar.find((p) => p.status === 'aprovada');
  const propostasValidas = propostasParaComparar.filter((p) => !p.vencida && p.status !== 'rejeitada' && p.status !== 'vencida');
  const menorCusto = propostasValidas.length > 0 ? Math.min(...propostasValidas.map((p) => p.total)) : null;

  // ---- RENDER ----

  if (loading && projetos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!selectedProjetoId) {
    if (projetos.length === 0) {
      return (
        <div className="text-center py-20">
          <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 mb-2">Nenhuma obra cadastrada</p>
          <p className="text-sm text-slate-400 mb-4">Crie uma obra para começar a planejar compras.</p>
          <button onClick={() => onSelectProjeto('')} className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold">
            <ChevronRight className="w-4 h-4" /> Ir para Obras
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Selecione uma obra para gerenciar compras:</p>
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
      {/* Sub-view tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {([
          { id: 'solicitacoes' as SubView, label: 'Solicitações de Compra', icon: ShoppingCart },
          { id: 'propostas' as SubView, label: 'Propostas', icon: FileText },
          { id: 'equalizacao' as SubView, label: 'Equalização', icon: TrendingDown },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setSubView(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                subView === t.id ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Solicitação selector for propostas and equalização */}
      {(subView === 'propostas' || subView === 'equalizacao') && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <label className="text-xs font-semibold text-slate-600">Solicitação:</label>
            <select
              value={selectedSolicitacaoId || ''}
              onChange={(e) => setSelectedSolicitacaoId(e.target.value || null)}
              className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
            >
              <option value="">Todas as solicitações</option>
              {solicitacoes.map((s) => (
                <option key={s.id} value={s.id}>{s.descricao}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* === SOLICITAÇÕES === */}
      {subView === 'solicitacoes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar solicitações..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
            </div>
            <button
              onClick={() => { resetSolicitacaoForm(); setShowSolicitacaoModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              Planejar Compras
            </button>
          </div>

          {solicitacoesFiltered.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-2">Nenhuma solicitação de compra</p>
              <p className="text-sm text-slate-400 mb-4">Comece planejando as necessidades de compra desta obra.</p>
              <button
                onClick={() => { resetSolicitacaoForm(); setShowSolicitacaoModal(true); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Criar primeira solicitação
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descrição</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoria</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Qtd</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Un.</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Necessária</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {solicitacoesFiltered.map((s) => {
                      const sc = statusSolicitacaoConfig[s.status] || statusSolicitacaoConfig.aberta;
                      const cc = categoriaConfig[s.categoria] || categoriaConfig.material;
                      const numPropostas = propostas.filter((p) => p.solicitacao_id === s.id).length;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-700">
                            {s.descricao}
                            {s.insumo && <span className="text-xs text-slate-400 ml-2">({s.insumo.codigo})</span>}
                            {numPropostas > 0 && <span className="ml-2 text-xs text-blue-500">{numPropostas} proposta{numPropostas > 1 ? 's' : ''}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${cc.color}`}>{cc.label}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">{s.quantidade}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{s.unidade}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {s.data_necessaria ? new Date(s.data_necessaria).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${sc.color}`}>{sc.label}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => { setEditingSolicitacao(s); setSolicitacaoForm({ descricao: s.descricao, categoria: s.categoria, insumo_id: s.insumo_id || '', unidade: s.unidade, quantidade: String(s.quantidade), data_necessaria: s.data_necessaria || '', orcamento_referencia: s.orcamento_referencia ? String(s.orcamento_referencia) : '' }); setShowSolicitacaoModal(true); }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSolicitacao(s.id)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === PROPOSTAS === */}
      {subView === 'propostas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { resetPropostaForm(); setShowPropostaModal(true); }}
              disabled={!selectedSolicitacaoId}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Proposta
            </button>
            <button
              onClick={() => { setShowImportModal(true); setImportData(null); }}
              disabled={!selectedSolicitacaoId}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Upload className="w-4 h-4" />
              Importar Propostas
            </button>
          </div>

          {propostasDaSolicitacao.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-2">
                {selectedSolicitacaoId ? 'Nenhuma proposta recebida' : 'Selecione uma solicitação para ver propostas'}
              </p>
              {selectedSolicitacaoId && (
                <p className="text-sm text-slate-400 mb-4">Cadastre ou importe propostas de fornecedores.</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {propostasDaSolicitacao.map((prop) => {
                const total = calcPropostaTotal(prop.itens || [], prop.frete, prop.impostos_adicionais, prop.desconto_global);
                const vencida = isPropostaVencida(prop.validade);
                const sp = statusPropostaConfig[prop.status] || statusPropostaConfig.recebida;
                return (
                  <div key={prop.id} className={`bg-white rounded-2xl border p-5 transition-all ${vencida ? 'border-rose-200' : 'border-slate-200 hover:shadow-md'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                          <Store className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-800 text-sm truncate">{prop.fornecedor?.nome || 'Fornecedor não encontrado'}</h4>
                          {prop.numero && <p className="text-xs text-slate-400">Proposta #{prop.numero}</p>}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${sp.color}`}>
                        {sp.label}
                      </span>
                    </div>

                    {vencida && (
                      <div className="flex items-center gap-1.5 text-xs text-rose-500 mb-2">
                        <AlertTriangle className="w-3 h-3" />
                        Proposta vencida
                      </div>
                    )}

                    <div className="space-y-1 text-xs text-slate-500">
                      {prop.data_proposta && (
                        <div>Data: {new Date(prop.data_proposta).toLocaleDateString('pt-BR')}</div>
                      )}
                      {prop.validade && (
                        <div>Validade: {new Date(prop.validade).toLocaleDateString('pt-BR')}</div>
                      )}
                      {prop.prazo_entrega && <div>Prazo: {prop.prazo_entrega}</div>}
                      {prop.condicao_pagamento && <div>Pagamento: {prop.condicao_pagamento}</div>}
                    </div>

                    {prop.itens && prop.itens.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="text-left py-1">Item</th>
                              <th className="text-right py-1">Qtd</th>
                              <th className="text-right py-1">Preço</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prop.itens.slice(0, 3).map((item) => (
                              <tr key={item.id} className="text-slate-600">
                                <td className="py-1 truncate max-w-[160px]">{item.descricao}</td>
                                <td className="text-right py-1">{item.quantidade} {item.unidade}</td>
                                <td className="text-right py-1 font-semibold">{formatBRL(item.preco_unitario)}</td>
                              </tr>
                            ))}
                            {prop.itens.length > 3 && (
                              <tr><td colSpan={3} className="text-center text-slate-400 py-1">+{prop.itens.length - 3} itens</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-500">
                          Frete: {formatBRL(prop.frete)} | Impostos: {formatBRL(prop.impostos_adicionais)}
                          {prop.desconto_global > 0 && ` | Desc: ${formatBRL(prop.desconto_global)}`}
                        </div>
                        <span className="text-lg font-bold text-slate-800">{formatBRL(total)}</span>
                      </div>
                    </div>

                    {prop.status !== 'aprovada' && prop.status !== 'rejeitada' && !vencida && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => setShowAprovacaoModal(prop)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleRejeitarProposta(prop)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Rejeitar
                        </button>
                        <button
                          onClick={() => handleDeleteProposta(prop.id)}
                          className="ml-auto p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {prop.status === 'aprovada' && (
                      <div className="flex items-center gap-1.5 mt-3 text-xs font-semibold text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                        Proposta aprovada
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === EQUALIZAÇÃO === */}
      {subView === 'equalizacao' && (
        <div className="space-y-4">
          {!selectedSolicitacaoId ? (
            <div className="text-center py-16">
              <TrendingDown className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-2">Selecione uma solicitação para equalizar</p>
              <p className="text-sm text-slate-400">A equalização compara propostas da mesma solicitação.</p>
            </div>
          ) : propostasParaComparar.length === 0 ? (
            <div className="text-center py-16">
              <TrendingDown className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-2">Nenhuma proposta para comparar</p>
              <p className="text-sm text-slate-400 mb-4">Cadastre propostas de diferentes fornecedores para esta solicitação.</p>
              <button
                onClick={() => { resetPropostaForm(); setShowPropostaModal(true); }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold"
              >
                <Plus className="w-4 h-4" />
                Cadastrar Proposta
              </button>
            </div>
          ) : (
            <>
              {/* Comparison table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide sticky left-0 bg-slate-50">Fornecedor</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Custo Total</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Prazo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pagamento</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Validade</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {propostasParaComparar
                        .sort((a, b) => a.total - b.total)
                        .map((prop) => {
                          const isMenor = menorCusto !== null && prop.total === menorCusto && !prop.vencida && prop.status !== 'rejeitada';
                          const isIncompleta = prop.vencida || prop.status === 'rejeitada';
                          return (
                            <tr key={prop.id} className={`hover:bg-slate-50 ${isMenor ? 'bg-emerald-50/50' : ''}`}>
                              <td className="px-4 py-3 sticky left-0 bg-white">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-700">{prop.fornecedor?.nome}</span>
                                  {isMenor && <Award className="w-4 h-4 text-emerald-500" />}
                                  {prop.vencida && <AlertTriangle className="w-4 h-4 text-rose-400" />}
                                </div>
                                {prop.numero && <span className="text-xs text-slate-400">#{prop.numero}</span>}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`text-sm font-bold ${isMenor ? 'text-emerald-600' : isIncompleta ? 'text-slate-400' : 'text-slate-700'}`}>
                                  {formatBRL(prop.total)}
                                </span>
                                {isMenor && <p className="text-xs text-emerald-500">Menor custo</p>}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-500">{prop.prazo_entrega || '-'}</td>
                              <td className="px-4 py-3 text-sm text-slate-500">{prop.condicao_pagamento || '-'}</td>
                              <td className="px-4 py-3 text-sm text-slate-500">
                                {prop.validade ? new Date(prop.validade).toLocaleDateString('pt-BR') : '-'}
                                {prop.vencida && <span className="ml-1 text-xs text-rose-500">(vencida)</span>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${(statusPropostaConfig[prop.status] || statusPropostaConfig.recebida).color}`}>
                                  {(statusPropostaConfig[prop.status] || statusPropostaConfig.recebida).label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Savings analysis */}
              {propostaAprovada && menorCusto !== null && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5">
                  <h4 className="font-bold text-slate-800 text-sm mb-4">Análise de Economia</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-lg p-4">
                      <p className="text-xs text-slate-500 mb-1">Menor custo comparável</p>
                      <p className="text-lg font-bold text-slate-700">{formatBRL(menorCusto)}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-4">
                      <p className="text-xs text-emerald-600 mb-1">Valor aprovado</p>
                      <p className="text-lg font-bold text-emerald-700">{formatBRL(propostaAprovada.total)}</p>
                    </div>
                    <div className={`rounded-lg p-4 ${propostaAprovada.total <= menorCusto ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                      <p className={`text-xs mb-1 ${propostaAprovada.total <= menorCusto ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {propostaAprovada.total <= menorCusto ? 'Economia aprovada' : 'Diferença'}
                      </p>
                      <p className={`text-lg font-bold ${propostaAprovada.total <= menorCusto ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {formatBRL(Math.abs(round2(menorCusto - propostaAprovada.total)))}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!propostaAprovada && propostasValidas.length >= 2 && menorCusto !== null && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Economia potencial (não aprovada)</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      O menor custo comparável é {formatBRL(menorCusto)}. Esta é a base de comparação — não é uma aprovação automática.
                      Selecione e aprove uma proposta com justificativa para confirmar a economia.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* === MODAL: NOVA SOLICITAÇÃO === */}
      {showSolicitacaoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">{editingSolicitacao ? 'Editar Solicitação' : 'Nova Solicitação de Compra'}</h3>
              <button onClick={() => { setShowSolicitacaoModal(false); resetSolicitacaoForm(); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descrição *</label>
                <input
                  type="text"
                  value={solicitacaoForm.descricao}
                  onChange={(e) => setSolicitacaoForm({ ...solicitacaoForm, descricao: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  placeholder="Ex: Cimento Portland CP II 50kg"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Categoria</label>
                  <select
                    value={solicitacaoForm.categoria}
                    onChange={(e) => setSolicitacaoForm({ ...solicitacaoForm, categoria: e.target.value as SolicitacaoCompra['categoria'] })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="material">Material</option>
                    <option value="servico">Serviço</option>
                    <option value="mao_obra">Mão de Obra</option>
                    <option value="equipamento">Equipamento</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Unidade</label>
                  <input
                    type="text"
                    value={solicitacaoForm.unidade}
                    onChange={(e) => setSolicitacaoForm({ ...solicitacaoForm, unidade: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="un, kg, m², m³..."
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quantidade *</label>
                  <input
                    type="text"
                    value={solicitacaoForm.quantidade}
                    onChange={(e) => setSolicitacaoForm({ ...solicitacaoForm, quantidade: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="Ex: 100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data necessária</label>
                  <input
                    type="date"
                    value={solicitacaoForm.data_necessaria}
                    onChange={(e) => setSolicitacaoForm({ ...solicitacaoForm, data_necessaria: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Orçamento de referência (R$) - opcional</label>
                <input
                  type="text"
                  value={solicitacaoForm.orcamento_referencia}
                  onChange={(e) => setSolicitacaoForm({ ...solicitacaoForm, orcamento_referencia: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  placeholder="Ex: 5.000,00"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowSolicitacaoModal(false); resetSolicitacaoForm(); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSolicitacao}
                disabled={!solicitacaoForm.descricao.trim()}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                {editingSolicitacao ? 'Salvar' : 'Criar Solicitação'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: NOVA PROPOSTA === */}
      {showPropostaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Cadastrar Proposta</h3>
              <button onClick={() => { setShowPropostaModal(false); resetPropostaForm(); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fornecedor *</label>
                  <select
                    value={propostaForm.fornecedor_id}
                    onChange={(e) => setPropostaForm({ ...propostaForm, fornecedor_id: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione...</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Número da proposta</label>
                  <input
                    type="text"
                    value={propostaForm.numero}
                    onChange={(e) => setPropostaForm({ ...propostaForm, numero: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="Opcional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data da proposta</label>
                  <input
                    type="date"
                    value={propostaForm.data_proposta}
                    onChange={(e) => setPropostaForm({ ...propostaForm, data_proposta: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Validade</label>
                  <input
                    type="date"
                    value={propostaForm.validade}
                    onChange={(e) => setPropostaForm({ ...propostaForm, validade: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Prazo de entrega</label>
                  <input
                    type="text"
                    value={propostaForm.prazo_entrega}
                    onChange={(e) => setPropostaForm({ ...propostaForm, prazo_entrega: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="Ex: 15 dias"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Condição de pagamento</label>
                  <input
                    type="text"
                    value={propostaForm.condicao_pagamento}
                    onChange={(e) => setPropostaForm({ ...propostaForm, condicao_pagamento: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="Ex: 30/60/90 dias"
                  />
                </div>
              </div>

              {/* Itens */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-600">Itens da proposta</label>
                  <button
                    onClick={() => setPropostaItens([...propostaItens, { descricao: '', unidade: 'un', quantidade: '1', preco_unitario: '0', desconto: '0' }])}
                    className="text-xs text-emerald-600 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Adicionar item
                  </button>
                </div>
                <div className="space-y-2">
                  {propostaItens.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                      <input
                        type="text"
                        value={item.descricao}
                        onChange={(e) => { const arr = [...propostaItens]; arr[idx].descricao = e.target.value; setPropostaItens(arr); }}
                        className="col-span-5 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                        placeholder="Descrição"
                      />
                      <input
                        type="text"
                        value={item.unidade}
                        onChange={(e) => { const arr = [...propostaItens]; arr[idx].unidade = e.target.value; setPropostaItens(arr); }}
                        className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                        placeholder="Un."
                      />
                      <input
                        type="text"
                        value={item.quantidade}
                        onChange={(e) => { const arr = [...propostaItens]; arr[idx].quantidade = e.target.value; setPropostaItens(arr); }}
                        className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                        placeholder="Qtd"
                      />
                      <input
                        type="text"
                        value={item.preco_unitario}
                        onChange={(e) => { const arr = [...propostaItens]; arr[idx].preco_unitario = e.target.value; setPropostaItens(arr); }}
                        className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                        placeholder="Preço"
                      />
                      <button
                        onClick={() => setPropostaItens(propostaItens.filter((_, i) => i !== idx))}
                        className="col-span-1 p-2 text-rose-400 hover:bg-rose-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Frete (R$)</label>
                  <input
                    type="text"
                    value={propostaForm.frete}
                    onChange={(e) => setPropostaForm({ ...propostaForm, frete: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Impostos não inclusos (R$)</label>
                  <input
                    type="text"
                    value={propostaForm.impostos_adicionais}
                    onChange={(e) => setPropostaForm({ ...propostaForm, impostos_adicionais: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Desconto global (R$)</label>
                  <input
                    type="text"
                    value={propostaForm.desconto_global}
                    onChange={(e) => setPropostaForm({ ...propostaForm, desconto_global: e.target.value })}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowPropostaModal(false); resetPropostaForm(); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProposta}
                disabled={!propostaForm.fornecedor_id || propostaItens.filter((i) => i.descricao.trim()).length === 0}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                Salvar Proposta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: IMPORTAR PROPOSTAS CSV === */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Importar Propostas (CSV)</h3>
              <button onClick={() => { setShowImportModal(false); setImportData(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Solicitação *</label>
                  <select
                    value={importSolicitacaoId}
                    onChange={(e) => setImportSolicitacaoId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione...</option>
                    {solicitacoes.map((s) => (
                      <option key={s.id} value={s.id}>{s.descricao}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fornecedor *</label>
                  <select
                    value={importFornecedorId}
                    onChange={(e) => setImportFornecedorId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">Selecione...</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={downloadCsvTemplate}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Baixar modelo
                </button>
                <label className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Selecionar arquivo CSV
                  <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              {importData && (
                <div className="space-y-3">
                  {importData.errors.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                      <div>
                        {importData.errors.map((err, i) => (
                          <p key={i} className="text-sm text-rose-600">{err}</p>
                        ))}
                        <p className="text-xs text-rose-500 mt-1">Corrija os erros antes de salvar. Nada será gravado.</p>
                      </div>
                    </div>
                  )}

                  {/* Preview table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">#</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Descrição</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Un.</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Qtd</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Preço</th>
                            <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500">Desc%</th>
                            <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Erros</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importData.rows.map((row, idx) => (
                            <tr key={idx} className={row.errors.length > 0 ? 'bg-rose-50/30' : ''}>
                              <td className="px-3 py-2 text-xs text-slate-400 text-center">{idx + 1}</td>
                              <td className="px-3 py-2 text-sm text-slate-700">{row.descricao}</td>
                              <td className="px-3 py-2 text-sm text-slate-500">{row.unidade}</td>
                              <td className="px-3 py-2 text-sm text-slate-600 text-right">{row.quantidade}</td>
                              <td className="px-3 py-2 text-sm text-slate-600 text-right">{row.preco_unitario}</td>
                              <td className="px-3 py-2 text-sm text-slate-600 text-right">{row.desconto}</td>
                              <td className="px-3 py-2 text-xs text-rose-500">
                                {row.errors.join('; ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {importData.errors.length === 0 && importSolicitacaoId && importFornecedorId && (
                    <button
                      onClick={handleConfirmImport}
                      className="w-full px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors"
                    >
                      Confirmar importação ({importData.rows.length} itens)
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: APROVAÇÃO === */}
      {showAprovacaoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Aprovar Proposta</h3>
              <button onClick={() => { setShowAprovacaoModal(null); setAprovacaoJustificativa(''); setAprovacaoEconomia(''); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-slate-700">{showAprovacaoModal.fornecedor?.nome}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Custo total: {formatBRL(calcPropostaTotal(showAprovacaoModal.itens || [], showAprovacaoModal.frete, showAprovacaoModal.impostos_adicionais, showAprovacaoModal.desconto_global))}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Justificativa *</label>
                <textarea
                  value={aprovacaoJustificativa}
                  onChange={(e) => setAprovacaoJustificativa(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 resize-none"
                  placeholder="Explique o motivo da aprovação (ex: menor custo, melhor prazo, qualidade, etc.)"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Economia aprovada (R$) - opcional</label>
                <input
                  type="text"
                  value={aprovacaoEconomia}
                  onChange={(e) => setAprovacaoEconomia(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400"
                  placeholder="Ex: 1.500,00"
                />
                <p className="text-xs text-slate-400 mt-1">Informe apenas se houver base de comparação válida.</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowAprovacaoModal(null); setAprovacaoJustificativa(''); setAprovacaoEconomia(''); }}
                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleAprovarProposta}
                disabled={!aprovacaoJustificativa.trim()}
                className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold"
              >
                Confirmar Aprovação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
