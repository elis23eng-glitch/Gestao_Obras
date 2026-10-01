


export interface MsProjectTask {
  uid: string;
  name: string;
  start: string;
  finish: string;
  predecessorUids: string[];
  outlineLevel: number;
  duration: string | null;
}

export interface ParsedMsProject {
  tasks: MsProjectTask[];
  projectName: string | null;
  startDate: string | null;
}

interface ParseResult {
  ok: boolean;
  data?: ParsedMsProject;
  error?: string;
}

export function parseMsProjectXml(xmlText: string): ParseResult {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return { ok: false, error: 'Arquivo XML inválido ou mal formatado' };
    }

    const projectNode = doc.querySelector('Project');
    if (!projectNode) {
      return { ok: false, error: 'Não é um arquivo do MS Project válido (elemento Project não encontrado)' };
    }

    const projectName = projectNode.querySelector(':scope > Name')?.textContent || null;
    const projectStart = projectNode.querySelector(':scope > StartDate')?.textContent || null;

    const taskNodes = projectNode.querySelectorAll(':scope > Tasks > Task');
    if (taskNodes.length === 0) {
      // Try alternate path
      const altTasks = doc.querySelectorAll('Task');
      if (altTasks.length === 0) {
        return { ok: false, error: 'Nenhuma tarefa encontrada no arquivo' };
      }
    }

    const allTaskNodes = projectNode.querySelectorAll('Task');
    const tasks: MsProjectTask[] = [];
    const uidToIndex = new Map<string, number>();

    allTaskNodes.forEach((taskNode, idx) => {
      const uid = taskNode.querySelector(':scope > UID')?.textContent || '';
      const name = taskNode.querySelector(':scope > Name')?.textContent || '';
      const start = taskNode.querySelector(':scope > Start')?.textContent || '';
      const finish = taskNode.querySelector(':scope > Finish')?.textContent || '';
      const outlineLevelStr = taskNode.querySelector(':scope > OutlineLevel')?.textContent || '1';
      const duration = taskNode.querySelector(':scope > Duration')?.textContent || null;

      // Collect predecessor UIDs
      const predecessorUids: string[] = [];
      const predLinks = taskNode.querySelectorAll(':scope > PredecessorLink');
      predLinks.forEach((link) => {
        const predUid = link.querySelector(':scope > PredecessorUID')?.textContent;
        if (predUid) predecessorUids.push(predUid);
      });

      // Skip summary tasks (tasks that have child tasks) — they're typically outline level 1 with sub-tasks
      // MS Project marks summary tasks with Summary=1
      const isSummary = taskNode.querySelector(':scope > Summary')?.textContent === '1';

      if (uid && name && start && finish) {
        uidToIndex.set(uid, idx);
        tasks.push({
          uid,
          name,
          start,
          finish,
          predecessorUids,
          outlineLevel: parseInt(outlineLevelStr, 10) || 1,
          duration: isSummary ? null : duration,
        });
      }
    });

    if (tasks.length === 0) {
      return { ok: false, error: 'Nenhuma tarefa válida encontrada no arquivo' };
    }

    return {
      ok: true,
      data: {
        tasks,
        projectName,
        startDate: projectStart,
      },
    };
  } catch {
    return { ok: false, error: 'Erro ao processar o arquivo XML' };
  }
}

export function msProjectDateToISO(msDate: string): string {
  // MS Project dates are like "2024-01-15T08:00:00" or with timezone
  // Extract just the date part
  const match = msDate.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : msDate;
}

export interface TarefaImport {
  nome: string;
  data_inicio: string;
  data_fim: string;
  predecessorNome: string | null;
  isSummary: boolean;
}

export function msProjectTasksToImport(
  tasks: MsProjectTask[],
  selectedTaskUids: Set<string>
): TarefaImport[] {
  const uidToTask = new Map(tasks.map((t) => [t.uid, t]));
  const result: TarefaImport[] = [];

  for (const task of tasks) {
    if (!selectedTaskUids.has(task.uid)) continue;

    let predecessorNome: string | null = null;
    if (task.predecessorUids.length > 0) {
      const firstPred = task.predecessorUids[0];
      const predTask = uidToTask.get(firstPred);
      if (predTask) predecessorNome = predTask.name;
    }

    result.push({
      nome: task.name,
      data_inicio: msProjectDateToISO(task.start),
      data_fim: msProjectDateToISO(task.finish),
      predecessorNome,
      isSummary: task.duration === null,
    });
  }

  return result;
}

// SINAPI CSV parsing
export interface SinapiRow {
  codigo: string;
  nome: string;
  unidade: string;
  preco: string;
  tipo: string;
  errors: string[];
  willUpdate: boolean;
}

export function parseSinapiCsv(text: string, existingCodigos: Set<string>): SinapiRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';

  // Detect if there's a header
  const hasHeader = /codigo|código|descricao|descrição|preço|preco|unid/i.test(firstLine);
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Try to detect column positions from header
  let codigoCol = 0;
  let nomeCol = 1;
  let unidadeCol = 2;
  let precoCol = 3;
  let tipoCol = -1;

  if (hasHeader) {
    const headers = firstLine.split(delimiter).map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
    headers.forEach((h, i) => {
      if (/codigo|código|cod/.test(h)) codigoCol = i;
      else if (/descricao|descrição|nome|item/.test(h)) nomeCol = i;
      else if (/unid/.test(h)) unidadeCol = i;
      else if (/preço|preco|valor|custo|pr.*unit/.test(h)) precoCol = i;
      else if (/tipo|classe|categoria/.test(h)) tipoCol = i;
    });
  }

  const validTipos = ['material', 'mao_obra', 'equipamento', 'servico'];
  const rows: SinapiRow[] = [];

  dataLines.forEach((line) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
    const errors: string[] = [];

    const codigo = cols[codigoCol] || '';
    const nome = cols[nomeCol] || '';
    const unidade = cols[unidadeCol] || '';
    const preco = cols[precoCol] || '0';
    const tipo = tipoCol >= 0 ? (cols[tipoCol] || 'material').toLowerCase().replace(/\s/g, '_') : 'material';

    if (!codigo) errors.push('Código obrigatório');
    if (!nome) errors.push('Nome obrigatório');

    const precoNum = parseFloat(preco.replace(/\./g, '').replace(',', '.'));
    if (isNaN(precoNum) || precoNum < 0) errors.push('Preço inválido');

    if (tipoCol >= 0 && !validTipos.includes(tipo)) {
      errors.push(`Tipo inválido`);
    }

    const willUpdate = existingCodigos.has(codigo);

    rows.push({
      codigo,
      nome,
      unidade,
      preco,
      tipo: validTipos.includes(tipo) ? tipo : 'material',
      errors,
      willUpdate,
    });
  });

  return rows;
}
