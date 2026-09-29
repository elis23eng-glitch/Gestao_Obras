import { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Download,
  FileText,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileDown,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import { parseBR, formatBR, formatBRL, custoDireto as calcCustoDireto, valorBdi, precoVenda } from '@/lib/calc';
import type { Projeto, Orcamento, OrcamentoItem, EapItem, Insumo } from '@/types/database';

interface ImportExportProps {
  selectedProjetoId: string | null;
  onSelectProjeto: (id: string) => void;
}

interface ParsedRow {
  rowIndex: number;
  codigo: string;
  nome: string;
  unidade: string;
  custo_unitario: string;
  tipo: string;
  errors: string[];
}

type Tab = 'import' | 'export';

export default function ImportExport({ selectedProjetoId, onSelectProjeto }: ImportExportProps) {
  useRbac();
  const [tab, setTab] = useState<Tab>('import');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number; duplicates: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingInsumos, setExistingInsumos] = useState<Insumo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [orcamento, setOrcamento] = useState<Orcamento | null>(null);
  const [, setEapItens] = useState<EapItem[]>([]);
  const [orcamentoItens, setOrcamentoItens] = useState<OrcamentoItem[]>([]);

  const fetchProjetos = useCallback(async () => {
    const { data } = await supabase.from('projetos').select('*').order('created_at', { ascending: false });
    setProjetos((data as Projeto[]) || []);
  }, []);

  const fetchExistingInsumos = useCallback(async () => {
    const { data } = await supabase.from('insumos').select('*').order('codigo');
    setExistingInsumos((data as Insumo[]) || []);
  }, []);

  const fetchExportData = useCallback(async (projId: string) => {
    const [projRes, eapRes, orcRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase.from('eap_itens').select('*').eq('projeto_id', projId).order('codigo'),
      supabase.from('orcamentos').select('*').eq('projeto_id', projId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setProjeto(projRes.data as Projeto);
    setEapItens((eapRes.data as EapItem[]) || []);
    const orc = orcRes.data as Orcamento | null;
    setOrcamento(orc);
    if (orc) {
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('*, eap_item:eap_itens(*), composicao:composicoes(*)')
        .eq('orcamento_id', orc.id);
      setOrcamentoItens((itensData as OrcamentoItem[]) || []);
    } else {
      setOrcamentoItens([]);
    }
  }, []);

  // Load projects on mount
  if (projetos.length === 0 && !error) {
    fetchProjetos();
    fetchExistingInsumos();
  }

  // Load export data when project selected
  if (selectedProjetoId && !projeto && tab === 'export') {
    fetchExportData(selectedProjetoId);
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setParsedRows([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCSV(text);
    };
    reader.onerror = () => setError('Erro ao ler o arquivo');
    reader.readAsText(file, 'UTF-8');
  };

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) {
      setError('Arquivo vazio');
      return;
    }

    // Detect delimiter (comma or semicolon)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    // Skip header if it contains "codigo" or "nome"
    const hasHeader = /codigo|código|nome/i.test(firstLine);
    const dataLines = hasHeader ? lines.slice(1) : lines;

    const validTipos = ['material', 'mao_obra', 'equipamento', 'servico'];
    const rows: ParsedRow[] = [];
    const seenCodigos = new Set<string>();

    dataLines.forEach((line, idx) => {
      const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      const errors: string[] = [];

      const codigo = cols[0] || '';
      const nome = cols[1] || '';
      const unidade = cols[2] || '';
      const custoStr = cols[3] || '0';
      const tipo = (cols[4] || 'material').toLowerCase().replace(/\s/g, '_');

      if (!codigo) errors.push('Código obrigatório');
      if (!nome) errors.push('Nome obrigatório');
      if (!unidade) errors.push('Unidade obrigatória');

      const custo = parseBR(custoStr);
      if (custo < 0 || !isFinite(custo)) errors.push('Custo inválido');

      if (!validTipos.includes(tipo)) {
        errors.push(`Tipo inválido (use: ${validTipos.join(', ')})`);
      }

      // Check duplicate within file
      if (seenCodigos.has(codigo)) {
        errors.push('Código duplicado no arquivo');
      }
      seenCodigos.add(codigo);

      // Check duplicate in DB
      if (existingInsumos.some((i) => i.codigo === codigo)) {
        errors.push('Código já existe no banco');
      }

      rows.push({
        rowIndex: idx + (hasHeader ? 2 : 1),
        codigo,
        nome,
        unidade,
        custo_unitario: custoStr,
        tipo: validTipos.includes(tipo) ? tipo : 'material',
        errors,
      });
    });

    setParsedRows(rows);
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      setError('Nenhuma linha válida para importar');
      return;
    }

    setImporting(true);
    setError(null);

    let success = 0;
    let errors = 0;
    let duplicates = 0;

    for (const row of validRows) {
      const { error: err } = await supabase.from('insumos').insert({
        codigo: row.codigo,
        nome: row.nome,
        unidade: row.unidade,
        custo_unitario: parseBR(row.custo_unitario),
        tipo: row.tipo as Insumo['tipo'],
        origem: 'Proprio',
      });
      if (err) {
        if (err.message.includes('duplicate') || err.code === '23505') {
          duplicates++;
        } else {
          errors++;
        }
      } else {
        success++;
      }
    }

    setImporting(false);
    setImportResult({ success, errors, duplicates });
    fetchExistingInsumos();
  };

  const downloadTemplate = () => {
    const csv = 'codigo;nome;unidade;custo_unitario;tipo\nMAT001;Cimento Portland;sc;28,50;material\nMAT002;Areia média;m3;85,00;material\nMO001;Pedreiro;h;35,00;mao_obra\nEQ001;Betoneira;h;15,00;equipamento\n';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_insumos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportOrcamentoCSV = () => {
    if (!projeto || !orcamento) return;
    const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
    const vBdi = valorBdi(cd, orcamento.bdi_taxa);
    const pv = precoVenda(cd, orcamento.bdi_taxa);

    const lines: string[] = [];
    lines.push(`BuildManager - Orcamento`);
    lines.push(`Obra;${projeto.nome}`);
    lines.push(`Cliente;${projeto.cliente}`);
    lines.push(`Data;${new Date().toLocaleDateString('pt-BR')}`);
    lines.push(`BDI;${formatBR(orcamento.bdi_taxa)}%`);
    lines.push('');
    lines.push('EAP;Composicao;Descricao;Quantidade;Custo Unitario;Total');
    orcamentoItens.forEach((item) => {
      const total = item.quantidade * item.custo_unitario;
      lines.push([
        item.eap_item?.codigo || '',
        item.composicao?.codigo || '',
        item.descricao || item.composicao?.nome || '',
        formatBR(item.quantidade).replace('.', ','),
        formatBR(item.custo_unitario).replace('.', ','),
        formatBR(total).replace('.', ','),
      ].join(';'));
    });
    lines.push('');
    lines.push(`Custo Direto;${formatBR(cd).replace('.', ',')}`);
    lines.push(`Valor BDI;${formatBR(vBdi).replace('.', ',')}`);
    lines.push(`Preco Venda;${formatBR(pv).replace('.', ',')}`);

    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orcamento_${projeto.nome.replace(/\s/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportOrcamentoHTML = () => {
    if (!projeto || !orcamento) return;
    const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
    const vBdi = valorBdi(cd, orcamento.bdi_taxa);
    const pv = precoVenda(cd, orcamento.bdi_taxa);

    const rowsHTML = orcamentoItens.map((item) => {
      const total = item.quantidade * item.custo_unitario;
      return `<tr>
        <td>${item.eap_item?.codigo || ''}</td>
        <td>${item.composicao?.codigo || ''}</td>
        <td>${item.descricao || item.composicao?.nome || ''}</td>
        <td style="text-align:right">${formatBR(item.quantidade)}</td>
        <td style="text-align:right">${formatBRL(item.custo_unitario)}</td>
        <td style="text-align:right">${formatBRL(total)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Orçamento - ${projeto.nome}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
  h1 { color: #059669; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
  th { background: #f1f5f9; text-align: left; font-weight: 600; }
  .totals { margin-top: 20px; }
  .totals div { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
  .total-label { font-weight: 600; }
  .total-venda { background: #ecfdf5; padding: 12px; border-radius: 8px; font-size: 18px; font-weight: bold; }
</style>
</head>
<body>
  <h1>Orçamento - ${projeto.nome}</h1>
  <p><strong>Cliente:</strong> ${projeto.cliente}</p>
  <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
  <p><strong>BDI:</strong> ${formatBR(orcamento.bdi_taxa)}%</p>
  <table>
    <thead>
      <tr><th>EAP</th><th>Composição</th><th>Descrição</th><th>Qtd</th><th>Custo Unit.</th><th>Total</th></tr>
    </thead>
    <tbody>${rowsHTML}</tbody>
  </table>
  <div class="totals">
    <div><span class="total-label">Custo Direto:</span><span>${formatBRL(cd)}</span></div>
    <div><span class="total-label">Valor do BDI (${formatBR(orcamento.bdi_taxa)}%):</span><span>${formatBRL(vBdi)}</span></div>
    <div class="total-venda"><span>Preço de Venda:</span><span>${formatBRL(pv)}</span></div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orcamento_${projeto.nome.replace(/\s/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 w-fit">
        <button
          onClick={() => setTab('import')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${tab === 'import' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Upload className="w-4 h-4" /> Importar
        </button>
        <button
          onClick={() => setTab('export')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${tab === 'export' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <Download className="w-4 h-4" /> Exportar
        </button>
      </div>

      {tab === 'import' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Importação de Insumos (CSV)</p>
              <p className="text-xs text-blue-600 mt-1">
                Formato: código;nome;unidade;custo_unitario;tipo (material, mao_obra, equipamento, servico).
                Use vírgula como separador decimal. Baixe o modelo para ver o exemplo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold"
            >
              <Upload className="w-4 h-4" /> Selecionar Arquivo CSV
            </button>
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold"
            >
              <FileDown className="w-4 h-4" /> Baixar Modelo
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileUpload}
            className="hidden"
          />

          {fileName && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span>{fileName}</span>
              <button onClick={() => { setFileName(''); setParsedRows([]); setImportResult(null); }} className="ml-2 text-slate-400 hover:text-rose-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <p className="text-sm text-rose-600">{error}</p>
            </div>
          )}

          {importResult && (
            <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Importação concluída</p>
                <p className="text-xs text-emerald-600 mt-1">
                  {importResult.success} insumos importados, {importResult.duplicates} duplicados ignorados, {importResult.errors} erros.
                </p>
              </div>
            </div>
          )}

          {parsedRows.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Prévia: {validRows.length} válidas, {errorRows.length} com erro
                </p>
                <button
                  onClick={handleImport}
                  disabled={importing || validRows.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {importing ? 'Importando...' : `Confirmar Importação (${validRows.length})`}
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Linha</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Código</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Nome</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Un.</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Custo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((row) => (
                        <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-50/50' : ''}>
                          <td className="px-4 py-2 text-xs text-slate-400">{row.rowIndex}</td>
                          <td className="px-4 py-2 text-xs font-mono text-slate-600">{row.codigo}</td>
                          <td className="px-4 py-2 text-xs text-slate-700">{row.nome}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{row.unidade}</td>
                          <td className="px-4 py-2 text-xs text-slate-600 text-right">{row.custo_unitario}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{row.tipo}</td>
                          <td className="px-4 py-2">
                            {row.errors.length === 0 ? (
                              <span className="text-xs text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> OK
                              </span>
                            ) : (
                              <span className="text-xs text-rose-500" title={row.errors.join('; ')}>
                                {row.errors[0]}
                                {row.errors.length > 1 && ` (+${row.errors.length - 1})`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'export' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Obra Selecionada</span>
            </div>
            <select
              value={selectedProjetoId || ''}
              onChange={(e) => { onSelectProjeto(e.target.value); setProjeto(null); }}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-400"
            >
              <option value="">Selecione uma obra...</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {!selectedProjetoId && (
            <div className="text-center py-16 text-slate-400">
              <Download className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Selecione uma obra para exportar o orçamento.</p>
            </div>
          )}

          {selectedProjetoId && projeto && orcamento && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500 mb-1">Custo Direto</p>
                  <p className="text-xl font-bold text-slate-800">
                    {formatBRL(calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario }))))}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500 mb-1">Valor do BDI ({formatBR(orcamento.bdi_taxa)}%)</p>
                  <p className="text-xl font-bold text-amber-600">
                    {formatBRL(valorBdi(calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario }))), orcamento.bdi_taxa))}
                  </p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white">
                  <p className="text-xs text-emerald-100 mb-1">Preço de Venda</p>
                  <p className="text-xl font-bold">
                    {formatBRL(precoVenda(calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario }))), orcamento.bdi_taxa))}
                  </p>
                </div>
              </div>

              {/* Export buttons */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4">Formatos de Exportação</h3>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={exportOrcamentoCSV}
                    disabled={orcamentoItens.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> Exportar CSV (Excel)
                  </button>
                  <button
                    onClick={exportOrcamentoHTML}
                    disabled={orcamentoItens.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    <FileText className="w-4 h-4" /> Exportar PDF (HTML imprimível)
                  </button>
                </div>
                {orcamentoItens.length === 0 && (
                  <p className="text-xs text-slate-400 mt-3">Nenhum item no orçamento. Adicione composições na aba Orçamentos antes de exportar.</p>
                )}
                <p className="text-xs text-slate-400 mt-3">
                  O CSV abre diretamente no Excel com separador de vírgula decimal. O HTML pode ser impresso como PDF pelo navegador (Ctrl+P).
                </p>
              </div>

              {/* Items preview */}
              {orcamentoItens.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-bold text-slate-800 mb-4">Itens do Orçamento ({orcamentoItens.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">EAP</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Comp.</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Descrição</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Qtd</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Custo Unit.</th>
                          <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orcamentoItens.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-2 text-xs font-mono text-slate-500">{item.eap_item?.codigo || '-'}</td>
                            <td className="px-4 py-2 text-xs font-mono text-slate-500">{item.composicao?.codigo || '-'}</td>
                            <td className="px-4 py-2 text-xs text-slate-700">{item.descricao || item.composicao?.nome || '-'}</td>
                            <td className="px-4 py-2 text-xs text-slate-600 text-right">{formatBR(item.quantidade)}</td>
                            <td className="px-4 py-2 text-xs text-slate-600 text-right">{formatBRL(item.custo_unitario)}</td>
                            <td className="px-4 py-2 text-xs font-semibold text-slate-700 text-right">{formatBRL(item.quantidade * item.custo_unitario)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectedProjetoId && projeto && !orcamento && (
            <div className="text-center py-16 text-slate-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">Esta obra não tem orçamento cadastrado.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
