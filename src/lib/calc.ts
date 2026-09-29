/**
 * Centralized calculation utilities for construction cost management.
 * All monetary calculations go through these functions to ensure consistency.
 */

/** Parse Brazilian decimal format ("1.234,56" or "1234,56" or "1234.56") to number */
export function parseBR(value: string): number {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.trim().replace(/\s/g, '');
  // If contains comma, treat as BR format: dots are thousands, comma is decimal
  if (cleaned.includes(',')) {
    const withoutDots = cleaned.replace(/\./g, '');
    const withDot = withoutDots.replace(',', '.');
    const num = parseFloat(withDot);
    return isNaN(num) ? 0 : num;
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Format number to Brazilian currency string */
export function formatBR(value: number, decimals = 2): string {
  if (!isFinite(value) || isNaN(value)) return '0,00';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format as BRL currency */
export function formatBRL(value: number): string {
  if (!isFinite(value) || isNaN(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Round to 2 decimal places using banker's rounding */
export function round2(value: number): number {
  if (!isFinite(value) || isNaN(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Validate that a number is finite, non-negative (if required), and not NaN/Infinity */
export function isValidNumber(value: number, allowNegative = false): boolean {
  if (typeof value !== 'number') return false;
  if (isNaN(value) || !isFinite(value)) return false;
  if (!allowNegative && value < 0) return false;
  return true;
}

/** Validate a percentage (0-100) */
export function isValidPercent(value: number): boolean {
  return isValidNumber(value) && value >= 0 && value <= 100;
}

/**
 * Calculate composition unit cost = sum(coeficiente * insumo.custo_unitario)
 * This is the core formula: custo unitário da composição
 */
export function custoComposicao(
  insumos: { coeficiente: number; custo_unitario: number }[]
): number {
  return round2(
    insumos.reduce((sum, ci) => sum + ci.coeficiente * ci.custo_unitario, 0)
  );
}

/**
 * Calculate item cost = quantidade * custo_unitario
 */
export function custoItem(quantidade: number, custoUnitario: number): number {
  return round2(quantidade * custoUnitario);
}

/**
 * Calculate custo direto = sum of all item costs
 */
export function custoDireto(itens: { quantidade: number; custo_unitario: number }[]): number {
  return round2(
    itens.reduce((sum, item) => sum + item.quantidade * item.custo_unitario, 0)
  );
}

/**
 * Calculate BDI value = custo direto * taxa / 100
 * BDI 0% is valid and returns 0.
 */
export function valorBdi(custoDiretoTotal: number, taxaBdi: number): number {
  if (!isValidNumber(taxaBdi, true)) return 0;
  return round2(custoDiretoTotal * taxaBdi / 100);
}

/**
 * Calculate preco de venda = custo direto + valor BDI
 */
export function precoVenda(custoDiretoTotal: number, taxaBdi: number): number {
  return round2(custoDiretoTotal + valorBdi(custoDiretoTotal, taxaBdi));
}

/**
 * Calculate EAP subtotal without double-counting:
 * only sum items directly attached to this node (not children's items,
 * since children are rendered separately in the tree).
 */
export function eapSubtotal(
  itens: { quantidade: number; custo_unitario: number }[]
): number {
  return custoDireto(itens);
}

/**
 * Calculate days between two dates (exclusive of time, local timezone).
 * Returns 0 if dates are equal or invalid.
 */
export function daysBetween(start: Date, end: Date): number {
  if (!(start instanceof Date) || !(end instanceof Date)) return 0;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const startMs = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endMs = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const diff = endMs - startMs;
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

/**
 * Gantt bar position: (days between task start and window start) / window days * 100
 */
export function ganttPosition(taskStart: Date, windowStart: Date, windowDays: number): number {
  if (windowDays <= 0) return 0;
  const offset = daysBetween(windowStart, taskStart);
  if (offset < 0) return 0;
  return Math.min(100, (offset / windowDays) * 100);
}

/**
 * Gantt bar width: task duration / window days * 100
 * Minimum 1 day = some visible width.
 */
export function ganttWidth(taskStart: Date, taskEnd: Date, windowDays: number): number {
  if (windowDays <= 0) return 0;
  const duration = Math.max(1, daysBetween(taskStart, taskEnd) + 1); // +1 to include both start and end day
  return Math.min(100, (duration / windowDays) * 100);
}

/**
 * Calculate physical progress with weighted average.
 * Each task is weighted by its valor_previsto (if > 0), otherwise equal weight.
 */
export function avançoFisico(
  tarefas: { percentual_concluido: number; valor_previsto: number }[]
): { percentual: number; isWeighted: boolean } {
  if (!tarefas || tarefas.length === 0) return { percentual: 0, isWeighted: false };
  const hasValues = tarefas.some((t) => t.valor_previsto > 0);
  if (hasValues) {
    const totalPeso = tarefas.reduce((s, t) => s + (t.valor_previsto > 0 ? t.valor_previsto : 0), 0);
    if (totalPeso === 0) {
      // All valores are 0, fall back to simple average
      const avg = tarefas.reduce((s, t) => s + t.percentual_concluido, 0) / tarefas.length;
      return { percentual: round2(avg), isWeighted: false };
    }
    const weighted = tarefas.reduce(
      (s, t) => s + t.percentual_concluido * (t.valor_previsto > 0 ? t.valor_previsto : 0),
      0
    );
    return { percentual: round2(weighted / totalPeso), isWeighted: true };
  }
  const avg = tarefas.reduce((s, t) => s + t.percentual_concluido, 0) / tarefas.length;
  return { percentual: round2(avg), isWeighted: false };
}

/**
 * Desvio em pontos percentuais (não em %)
 */
export function desvioPontosPercentuais(realizado: number, previsto: number): number {
  return round2(realizado - previsto);
}
