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
  CalendarDays,
  RefreshCw,
  Database,
  Network,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useRbac } from '@/lib/rbac';
import { parseBR, formatBR, formatBRL, custoDireto as calcCustoDireto, valorBdi, precoVenda } from '@/lib/calc';
import { parseMsProjectXml, msProjectTasksToImport, parseSinapiCsv, type MsProjectTask, type SinapiRow, type TarefaImport } from '@/lib/import-parsers';
import type { Projeto, Orcamento, OrcamentoItem, EapItem, Insumo, Tarefa } from '@/types/database';

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
type ImportMode = 'insumos' | 'msproject' | 'sinapi';

export default function ImportExport({ selectedProjetoId, onSelectProjeto }: ImportExportProps) {
  useRbac();
  const [tab, setTab] = useState<Tab>('import');
  const [importMode, setImportMode] = useState<ImportMode>('insumos');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [sinapiRows, setSinapiRows] = useState<SinapiRow[]>([]);
  const [msProjectTasks, setMsProjectTasks] = useState<MsProjectTask[]>([]);
  const [msProjectSelected, setMsProjectSelected] = useState<Set<string>>(new Set());
  const [msProjectName, setMsProjectName] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number; duplicates: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingInsumos, setExistingInsumos] = useState<Insumo[]>([]);
  const [existingTarefas, setExistingTarefas] = useState<Tarefa[]>([]);
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

  const fetchExistingTarefas = useCallback(async (projId: string) => {
    const { data } = await supabase.from('tarefas').select('*').eq('projeto_id', projId);
    setExistingTarefas((data as Tarefa[]) || []);
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

  if (projetos.length === 0 && !error) {
    fetchProjetos();
    fetchExistingInsumos();
  }

  if (selectedProjetoId && !projeto && tab === 'export') {
    fetchExportData(selectedProjetoId);
  }

  const resetImportState = () => {
    setParsedRows([]);
    setSinapiRows([]);
    setMsProjectTasks([]);
    setMsProjectSelected(new Set());
    setMsProjectName(null);
    setFileName('');
    setImportResult(null);
    setError(null);
  };

  const switchImportMode = (mode: ImportMode) => {
    setImportMode(mode);
    resetImportState();
  };

  // --- Insumos CSV Import ---
  const handleInsumosUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setParsedRows([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseInsumosCSV(text);
    };
    reader.onerror = () => setError('Erro ao ler o arquivo');
    reader.readAsText(file, 'UTF-8');
  };

  const parseInsumosCSV = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) { setError('Arquivo vazio'); return; }

    const firstLine = lines[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';
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
      if (!validTipos.includes(tipo)) errors.push(`Tipo inválido`);
      if (seenCodigos.has(codigo)) errors.push('Código duplicado no arquivo');
      seenCodigos.add(codigo);
      if (existingInsumos.some((i) => i.codigo === codigo)) errors.push('Código já existe no banco');

      rows.push({
        rowIndex: idx + (hasHeader ? 2 : 1),
        codigo, nome, unidade, custo_unitario: custoStr,
        tipo: validTipos.includes(tipo) ? tipo : 'material',
        errors,
      });
    });
    setParsedRows(rows);
  };

  const handleInsumosImport = async () => {
    const valid = parsedRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) { setError('Nenhuma linha válida para importar'); return; }
    setImporting(true);
    let success = 0, errors = 0, duplicates = 0;
    for (const row of valid) {
      const { error: err } = await supabase.from('insumos').insert({
        codigo: row.codigo, nome: row.nome, unidade: row.unidade,
        custo_unitario: parseBR(row.custo_unitario),
        tipo: row.tipo as Insumo['tipo'], origem: 'Proprio',
      });
      if (err) {
        if (err.message.includes('duplicate') || err.code === '23505') duplicates++;
        else errors++;
      } else success++;
    }
    setImporting(false);
    setImportResult({ success, errors, duplicates, updated: 0 });
    fetchExistingInsumos();
  };

  // --- MS Project XML Import ---
  const handleMsProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    resetImportState();
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const result = parseMsProjectXml(text);
      if (!result.ok || !result.data) {
        setError(result.error || 'Erro ao processar arquivo');
        return;
      }
      setMsProjectTasks(result.data.tasks);
      setMsProjectName(result.data.projectName);
      // Select all non-summary tasks by default
      const defaultSelected = new Set(result.data.tasks.map((t) => t.uid));
      setMsProjectSelected(defaultSelected);
    };
    reader.onerror = () => setError('Erro ao ler o arquivo');
    reader.readAsText(file, 'UTF-8');
  };

  const handleMsProjectImport = async () => {
    if (!selectedProjetoId) { setError('Selecione uma obra para importar as tarefas'); return; }
    const imports = msProjectTasksToImport(msProjectTasks, msProjectSelected);
    if (imports.length === 0) { setError('Nenhuma tarefa selecionada'); return; }

    setImporting(true);
    let success = 0, errors = 0;

    // First, insert all tasks without dependencies
    const taskNameToId = new Map<string, string>();
    const pendingDeps: { task: TarefaImport; insertId: string }[] = [];

    for (const task of imports) {
      const { data, error: err } = await supabase.from('tarefas').insert({
        projeto_id: selectedProjetoId,
        nome: task.nome,
        data_inicio: task.data_inicio,
        data_fim: task.data_fim,
        dependencia_id: null,
        percentual_concluido: 0,
        valor_previsto: 0,
      }).select('id').single();

      if (err) { errors++; continue; }
      success++;
      taskNameToId.set(task.nome, data.id);
      if (task.predecessorNome) {
        pendingDeps.push({ task, insertId: data.id });
      }
    }

    // Now link dependencies
    for (const { task, insertId } of pendingDeps) {
      const depId = taskNameToId.get(task.predecessorNome!);
      if (depId) {
        await supabase.from('tarefas').update({ dependencia_id: depId }).eq('id', insertId);
      }
    }

    setImporting(false);
    setImportResult({ success, errors, duplicates: 0, updated: 0 });
    fetchExistingTarefas(selectedProjetoId);
  };

  const toggleTaskSelection = (uid: string) => {
    setMsProjectSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  // --- SINAPI Import/Update ---
  const handleSinapiUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setSinapiRows([]);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const existingCodigos = new Set(existingInsumos.map((i) => i.codigo));
      const rows = parseSinapiCsv(text, existingCodigos);
      setSinapiRows(rows);
    };
    reader.onerror = () => setError('Erro ao ler o arquivo');
    reader.readAsText(file, 'UTF-8');
  };

  const handleSinapiImport = async () => {
    const valid = sinapiRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) { setError('Nenhuma linha válida'); return; }

    setImporting(true);
    let success = 0, errors = 0, updated = 0, duplicates = 0;

    for (const row of valid) {
      const precoNum = parseFloat(row.preco.replace(/\./g, '').replace(',', '.'));
      if (row.willUpdate) {
        // Update existing insumo price
        const { error: err } = await supabase
          .from('insumos')
          .update({ custo_unitario: precoNum, origem: 'SINAPI' })
          .eq('codigo', row.codigo);
        if (err) errors++;
        else { updated++; success++; }
      } else {
        // Insert new insumo
        const { error: err } = await supabase.from('insumos').insert({
          codigo: row.codigo, nome: row.nome, unidade: row.unidade,
          custo_unitario: precoNum,
          tipo: row.tipo as Insumo['tipo'], origem: 'SINAPI',
        });
        if (err) {
          if (err.message.includes('duplicate') || err.code === '23505') duplicates++;
          else errors++;
        } else { success++; }
      }
    }

    setImporting(false);
    setImportResult({ success, errors, duplicates, updated });
    fetchExistingInsumos();
  };

  const downloadTemplate = () => {
    const csv = 'codigo;nome;unidade;custo_unitario;tipo\nMAT001;Cimento Portland;sc;28,50;material\nMAT002;Areia média;m3;85,00;material\nMO001;Pedreiro;h;35,00;mao_obra\nEQ001;Betoneira;h;15,00;equipamento\n';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo_insumos.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSinapiTemplate = () => {
    const csv = 'codigo;descricao;unidade;preco;tipo\nSINAPI_001;Areia média lavada;m3;95,00;material\nSINAPI_002;Cimento Portland CP II 32;sc;30,50;material\nSINAPI_003;Pedreiro;h;38,00;mao_obra\nSINAPI_004;Betoneira 400L;d;45,00;equipamento\n';
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo_sinapi.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // --- Export functions ---
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
        item.eap_item?.codigo || '', item.composicao?.codigo || '',
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
    a.href = url; a.download = `orcamento_${projeto.nome.replace(/\s/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportOrcamentoHTML = () => {
    if (!projeto || !orcamento) return;
    const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
    const vBdi = valorBdi(cd, orcamento.bdi_taxa);
    const pv = precoVenda(cd, orcamento.bdi_taxa);
    const rowsHTML = orcamentoItens.map((item) => {
      const total = item.quantidade * item.custo_unitario;
      return `<tr><td>${item.eap_item?.codigo || ''}</td><td>${item.composicao?.codigo || ''}</td><td>${item.descricao || item.composicao?.nome || ''}</td><td style="text-align:right">${formatBR(item.quantidade)}</td><td style="text-align:right">${formatBRL(item.custo_unitario)}</td><td style="text-align:right">${formatBRL(total)}</td></tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Orçamento - ${projeto.nome}</title><style>body{font-family:Arial,sans-serif;margin:40px;color:#1e293b}h1{color:#059669}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:12px}th{background:#f1f5f9;text-align:left;font-weight:600}.totals{margin-top:20px}.totals div{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0}.total-venda{background:#ecfdf5;padding:12px;border-radius:8px;font-size:18px;font-weight:bold}</style></head><body><h1>Orçamento - ${projeto.nome}</h1><p><strong>Cliente:</strong> ${projeto.cliente}</p><p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p><p><strong>BDI:</strong> ${formatBR(orcamento.bdi_taxa)}%</p><table><thead><tr><th>EAP</th><th>Composição</th><th>Descrição</th><th>Qtd</th><th>Custo Unit.</th><th>Total</th></tr></thead><tbody>${rowsHTML}</tbody></table><div class="totals"><div><span>Custo Direto:</span><span>${formatBRL(cd)}</span></div><div><span>Valor do BDI (${formatBR(orcamento.bdi_taxa)}%):</span><span>${formatBRL(vBdi)}</span></div><div class="total-venda"><span>Preço de Venda:</span><span>${formatBRL(pv)}</span></div></div></body></html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orcamento_${projeto.nome.replace(/\s/g, '_')}.html`; a.click();
    URL.revokeObjectURL(url);
  };

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const errorRows = parsedRows.filter((r) => r.errors.length > 0);
  const validSinapi = sinapiRows.filter((r) => r.errors.length === 0);
  const errorSinapi = sinapiRows.filter((r) => r.errors.length > 0);
  const sinapiToUpdate = validSinapi.filter((r) => r.willUpdate);
  const sinapiToInsert = validSinapi.filter((r) => !r.willUpdate);

  const importModeTabs: { id: ImportMode; label: string; icon: typeof Upload; desc: string }[] = [
    { id: 'insumos', label: 'Insumos (CSV)', icon: Database, desc: 'Importar insumos do zero' },
    { id: 'sinapi', label: 'SINAPI / Atualização', icon: RefreshCw, desc: 'Atualizar preços e importar novos' },
    { id: 'msproject', label: 'MS Project (XML)', icon: CalendarDays, desc: 'Importar cronograma' },
  ];

  return (
    <div className="space-y-6">
      {/* Main Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-1 w-fit">
        <button onClick={() => setTab('import')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${tab === 'import' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Upload className="w-4 h-4" /> Importar
        </button>
        <button onClick={() => setTab('export')} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${tab === 'export' ? 'bg-emerald-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Download className="w-4 h-4" /> Exportar
        </button>
      </div>

      {tab === 'import' && (
        <div className="space-y-4">
          {/* Import mode sub-tabs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {importModeTabs.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => switchImportMode(m.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition text-left ${importMode === m.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${importMode === m.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <div>
                    <p className={`text-sm font-bold ${importMode === m.id ? 'text-emerald-700' : 'text-slate-700'}`}>{m.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Insumos CSV Import */}
          {importMode === 'insumos' && (
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
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold">
                  <Upload className="w-4 h-4" /> Selecionar Arquivo CSV
                </button>
                <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold">
                  <FileDown className="w-4 h-4" /> Baixar Modelo
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleInsumosUpload} className="hidden" />
              {fileName && importMode === 'insumos' && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FileText className="w-4 h-4 text-emerald-500" /><span>{fileName}</span>
                  <button onClick={() => { setFileName(''); setParsedRows([]); setImportResult(null); }} className="ml-2 text-slate-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                </div>
              )}
              {error && importMode === 'insumos' && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3"><AlertCircle className="w-4 h-4 text-rose-500" /><p className="text-sm text-rose-600">{error}</p></div>
              )}
              {importResult && importMode === 'insumos' && (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Importação concluída</p>
                    <p className="text-xs text-emerald-600 mt-1">{importResult.success} insumos importados, {importResult.duplicates} duplicados ignorados, {importResult.errors} erros.</p>
                  </div>
                </div>
              )}
              {parsedRows.length > 0 && (
                <ParsedTable
                  rows={parsedRows}
                  validCount={validRows.length}
                  errorCount={errorRows.length}
                  importing={importing}
                  onConfirm={handleInsumosImport}
                />
              )}
            </div>
          )}

          {/* SINAPI Import/Update */}
          {importMode === 'sinapi' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Importação / Atualização SINAPI</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Importe planilhas SINAPI ou de outros sistemas para atualizar preços de insumos já cadastrados e adicionar novos.
                    Insumos com código já existente terão o preço atualizado. Novos códigos serão criados com origem "SINAPI".
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold">
                  <Upload className="w-4 h-4" /> Selecionar Planilha CSV
                </button>
                <button onClick={downloadSinapiTemplate} className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold">
                  <FileDown className="w-4 h-4" /> Baixar Modelo SINAPI
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleSinapiUpload} className="hidden" />
              {fileName && importMode === 'sinapi' && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FileText className="w-4 h-4 text-amber-500" /><span>{fileName}</span>
                  <button onClick={() => { setFileName(''); setSinapiRows([]); setImportResult(null); }} className="ml-2 text-slate-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                </div>
              )}
              {error && importMode === 'sinapi' && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3"><AlertCircle className="w-4 h-4 text-rose-500" /><p className="text-sm text-rose-600">{error}</p></div>
              )}
              {importResult && importMode === 'sinapi' && (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Importação concluída</p>
                    <p className="text-xs text-emerald-600 mt-1">
                      {importResult.updated} preços atualizados, {importResult.success - importResult.updated} novos insumos, {importResult.duplicates} duplicados, {importResult.errors} erros.
                    </p>
                  </div>
                </div>
              )}
              {sinapiRows.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-semibold text-slate-700">{validSinapi.length} válidas, {errorSinapi.length} com erro</span>
                      {sinapiToUpdate.length > 0 && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">{sinapiToUpdate.length} serão atualizados</span>
                      )}
                      {sinapiToInsert.length > 0 && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">{sinapiToInsert.length} novos</span>
                      )}
                    </div>
                    <button onClick={handleSinapiImport} disabled={importing || validSinapi.length === 0} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      {importing ? 'Processando...' : `Confirmar (${validSinapi.length})`}
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Código</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Nome</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Un.</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Preço</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Ação</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sinapiRows.slice(0, 100).map((row, i) => (
                            <tr key={i} className={row.errors.length > 0 ? 'bg-rose-50/50' : ''}>
                              <td className="px-4 py-2 text-xs font-mono text-slate-600">{row.codigo}</td>
                              <td className="px-4 py-2 text-xs text-slate-700">{row.nome}</td>
                              <td className="px-4 py-2 text-xs text-slate-500">{row.unidade}</td>
                              <td className="px-4 py-2 text-xs text-slate-600 text-right">{row.preco}</td>
                              <td className="px-4 py-2 text-xs text-slate-500">{row.tipo}</td>
                              <td className="px-4 py-2">
                                {row.errors.length === 0 ? (
                                  row.willUpdate ? (
                                    <span className="text-xs text-amber-600 font-semibold flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Atualizar</span>
                                  ) : (
                                    <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Novo</span>
                                  )
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </td>
                              <td className="px-4 py-2">
                                {row.errors.length === 0 ? (
                                  <span className="text-xs text-emerald-600">OK</span>
                                ) : (
                                  <span className="text-xs text-rose-500" title={row.errors.join('; ')}>{row.errors[0]}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {sinapiRows.length > 100 && (
                      <div className="px-4 py-3 text-xs text-slate-400 text-center bg-slate-50">
                        Mostrando 100 de {sinapiRows.length} linhas. Todas serão processadas na importação.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MS Project XML Import */}
          {importMode === 'msproject' && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
                <Network className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-indigo-800">Importação de Cronograma do MS Project</p>
                  <p className="text-xs text-indigo-600 mt-1">
                    Exporte seu cronograma do MS Project como XML (Arquivo {'>'} Salvar Como {'>'} Formato XML).
                    As tarefas serão importadas com datas, durações e dependências. Selecione quais tarefas importar.
                  </p>
                </div>
              </div>

              {/* Project selector */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Obra de Destino *</label>
                <select
                  value={selectedProjetoId || ''}
                  onChange={(e) => { onSelectProjeto(e.target.value); if (e.target.value) fetchExistingTarefas(e.target.value); }}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-400"
                >
                  <option value="">Selecione uma obra...</option>
                  {projetos.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
                </select>
                {existingTarefas.length > 0 && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Esta obra já tem {existingTarefas.length} tarefa(s). As novas tarefas serão adicionadas às existentes.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-semibold">
                  <Upload className="w-4 h-4" /> Selecionar Arquivo XML
                </button>
              </div>
              <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" onChange={handleMsProjectUpload} className="hidden" />

              {fileName && importMode === 'msproject' && (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FileText className="w-4 h-4 text-indigo-500" /><span>{fileName}</span>
                  <button onClick={() => { resetImportState(); }} className="ml-2 text-slate-400 hover:text-rose-500"><X className="w-4 h-4" /></button>
                </div>
              )}
              {error && importMode === 'msproject' && (
                <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-3"><AlertCircle className="w-4 h-4 text-rose-500" /><p className="text-sm text-rose-600">{error}</p></div>
              )}
              {importResult && importMode === 'msproject' && (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-800">Cronograma importado</p>
                    <p className="text-xs text-emerald-600 mt-1">{importResult.success} tarefas importadas, {importResult.errors} erros. Verifique o cronograma na aba Planejamento.</p>
                  </div>
                </div>
              )}

              {msProjectTasks.length > 0 && (
                <div className="space-y-4">
                  {msProjectName && (
                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
                      <CalendarDays className="w-4 h-4 text-indigo-500" />
                      <span>Projeto: <strong>{msProjectName}</strong> - {msProjectTasks.length} tarefas encontradas</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700">{msProjectSelected.size} selecionadas de {msProjectTasks.length}</span>
                      <button onClick={() => setMsProjectSelected(new Set(msProjectTasks.map(t => t.uid)))} className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold">Selecionar todas</button>
                      <button onClick={() => setMsProjectSelected(new Set())} className="text-xs text-slate-500 hover:text-slate-700 font-semibold">Limpar</button>
                    </div>
                    <button
                      onClick={handleMsProjectImport}
                      disabled={importing || msProjectSelected.size === 0 || !selectedProjetoId}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                    >
                      {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                      {importing ? 'Importando...' : `Importar ${msProjectSelected.size} Tarefas`}
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase w-8"></th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Nível</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Tarefa</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Início</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Fim</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Deps.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {msProjectTasks.map((task) => (
                            <tr key={task.uid} className={msProjectSelected.has(task.uid) ? '' : 'opacity-40'}>
                              <td className="px-4 py-2">
                                <input
                                  type="checkbox"
                                  checked={msProjectSelected.has(task.uid)}
                                  onChange={() => toggleTaskSelection(task.uid)}
                                  className="w-4 h-4 accent-indigo-500"
                                />
                              </td>
                              <td className="px-4 py-2 text-xs text-slate-400">{task.outlineLevel}</td>
                              <td className="px-4 py-2 text-xs text-slate-700" style={{ paddingLeft: `${(task.outlineLevel - 1) * 12 + 16}px` }}>
                                {task.duration === null && <span className="text-indigo-400 font-bold mr-1">▸</span>}
                                {task.name}
                              </td>
                              <td className="px-4 py-2 text-xs text-slate-500">{new Date(task.start).toLocaleDateString('pt-BR')}</td>
                              <td className="px-4 py-2 text-xs text-slate-500">{new Date(task.finish).toLocaleDateString('pt-BR')}</td>
                              <td className="px-4 py-2 text-xs text-slate-400">{task.predecessorUids.length > 0 ? `${task.predecessorUids.length}` : '-'}</td>
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
              {projetos.map((p) => (<option key={p.id} value={p.id}>{p.nome}</option>))}
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
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500 mb-1">Custo Direto</p>
                  <p className="text-xl font-bold text-slate-800">{formatBRL(calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario }))))}</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs text-slate-500 mb-1">Valor do BDI ({formatBR(orcamento.bdi_taxa)}%)</p>
                  <p className="text-xl font-bold text-amber-600">{formatBRL(valorBdi(calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario }))), orcamento.bdi_taxa))}</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-5 text-white">
                  <p className="text-xs text-emerald-100 mb-1">Preço de Venda</p>
                  <p className="text-xl font-bold">{formatBRL(precoVenda(calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario }))), orcamento.bdi_taxa))}</p>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4">Formatos de Exportação</h3>
                <div className="flex flex-wrap gap-3">
                  <button onClick={exportOrcamentoCSV} disabled={orcamentoItens.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                    <FileSpreadsheet className="w-4 h-4" /> Exportar CSV (Excel)
                  </button>
                  <button onClick={exportOrcamentoHTML} disabled={orcamentoItens.length === 0} className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
                    <FileText className="w-4 h-4" /> Exportar PDF (HTML imprimível)
                  </button>
                </div>
                {orcamentoItens.length === 0 && <p className="text-xs text-slate-400 mt-3">Nenhum item no orçamento. Adicione composições na aba Orçamentos antes de exportar.</p>}
                <p className="text-xs text-slate-400 mt-3">O CSV abre diretamente no Excel com separador de vírgula decimal. O HTML pode ser impresso como PDF pelo navegador (Ctrl+P).</p>
              </div>
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

function ParsedTable({ rows, validCount, errorCount, importing, onConfirm }: {
  rows: ParsedRow[];
  validCount: number;
  errorCount: number;
  importing: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Prévia: {validCount} válidas, {errorCount} com erro</p>
        <button onClick={onConfirm} disabled={importing || validCount === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold">
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {importing ? 'Importando...' : `Confirmar Importação (${validCount})`}
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
              {rows.map((row) => (
                <tr key={row.rowIndex} className={row.errors.length > 0 ? 'bg-rose-50/50' : ''}>
                  <td className="px-4 py-2 text-xs text-slate-400">{row.rowIndex}</td>
                  <td className="px-4 py-2 text-xs font-mono text-slate-600">{row.codigo}</td>
                  <td className="px-4 py-2 text-xs text-slate-700">{row.nome}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{row.unidade}</td>
                  <td className="px-4 py-2 text-xs text-slate-600 text-right">{row.custo_unitario}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{row.tipo}</td>
                  <td className="px-4 py-2">
                    {row.errors.length === 0 ? (
                      <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>
                    ) : (
                      <span className="text-xs text-rose-500" title={row.errors.join('; ')}>{row.errors[0]}{row.errors.length > 1 && ` (+${row.errors.length - 1})`}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
