import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, Lightbulb, TrendingUp, AlertTriangle, ClipboardList, Database, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatBRL, formatBR, custoDireto as calcCustoDireto, valorBdi, precoVenda, avançoFisico, daysBetween } from '@/lib/calc';
import type { Projeto, Tarefa, OrcamentoItem, Orcamento, DiarioObra, Medicao } from '@/types/database';

interface AssistenteIAProps {
  selectedProjetoId: string | null;
}

interface Mensagem {
  role: 'user' | 'assistant';
  content: string;
}

const sugestoes = [
  { icon: TrendingUp, text: 'Qual o status financeiro da obra?' },
  { icon: AlertTriangle, text: 'Quais tarefas estão atrasadas?' },
  { icon: ClipboardList, text: 'Resumo do diário de obra recente' },
  { icon: Lightbulb, text: 'Resumo geral da obra' },
];

export default function AssistenteIA({ selectedProjetoId }: AssistenteIAProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: 'assistant',
      content:
        'Olá! Sou o assistente de resumo automático do BuildManager. Posso consultar os dados reais da obra selecionada e gerar resumos sobre orçamento, tarefas, diário e indicadores. Como posso ajudar?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noProjeto, setNoProjeto] = useState(!selectedProjetoId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNoProjeto(!selectedProjetoId);
  }, [selectedProjetoId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens, loading]);

  const fetchObraData = async (projId: string) => {
    const [projRes, tarRes, orcRes, diarRes, medRes] = await Promise.all([
      supabase.from('projetos').select('*').eq('id', projId).maybeSingle(),
      supabase.from('tarefas').select('*').eq('projeto_id', projId).order('data_inicio', { ascending: true }),
      supabase.from('orcamentos').select('*').eq('projeto_id', projId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('diario_obra').select('*, usuario:usuarios(nome)').eq('projeto_id', projId).order('data', { ascending: false }).limit(5),
      supabase.from('medicoes').select('*').eq('projeto_id', projId).order('data', { ascending: true }),
    ]);

    const projeto = projRes.data as Projeto | null;
    const tarefas = (tarRes.data as Tarefa[]) || [];
    const orcamento = orcRes.data as Orcamento | null;
    const diarios = (diarRes.data as (DiarioObra & { usuario?: { nome: string } })[]) || [];
    const medicoes = (medRes.data as Medicao[]) || [];

    let orcamentoItens: OrcamentoItem[] = [];
    if (orcamento) {
      const { data: itensData } = await supabase
        .from('orcamento_itens')
        .select('*, composicao:composicoes(*)')
        .eq('orcamento_id', orcamento.id);
      orcamentoItens = (itensData as OrcamentoItem[]) || [];
    }

    return { projeto, tarefas, orcamento, orcamentoItens, diarios, medicoes };
  };

  const gerarResposta = async (pergunta: string): Promise<string> => {
    if (!selectedProjetoId) {
      return 'Nenhuma obra selecionada. Selecione uma obra para consultar seus dados.';
    }

    try {
      const { projeto, tarefas, orcamento, orcamentoItens, diarios, medicoes } = await fetchObraData(selectedProjetoId);

      if (!projeto) {
        return 'Obra não encontrada ou sem acesso.';
      }

      const p = pergunta.toLowerCase();

      // Status financeiro
      if (p.includes('financeiro') || p.includes('orçamento') || p.includes('custo') || p.includes('gasto') || p.includes('bdi')) {
        if (!orcamento || orcamentoItens.length === 0) {
          return 'Não há orçamento cadastrado para esta obra. Crie um orçamento e adicione composições na aba "Orçamentos" para visualizar dados financeiros.';
        }
        const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
        const taxaBdi = orcamento.bdi_taxa;
        const vBdi = valorBdi(cd, taxaBdi);
        const pv = precoVenda(cd, taxaBdi);
        const custoRealizado = medicoes.reduce((s, m) => s + m.valor_realizado, 0);
        const { percentual: avanço, isWeighted } = avançoFisico(tarefas.map(t => ({ percentual_concluido: t.percentual_concluido, valor_previsto: t.valor_previsto })));

        const linhas: string[] = [
          `Dados financeiros da obra "${projeto.nome}" (consulta em ${new Date().toLocaleDateString('pt-BR')}):`,
          '',
          `- Custo direto orçado: ${formatBRL(cd)}`,
          `- Taxa de BDI: ${formatBR(taxaBdi)}%`,
          `- Valor do BDI: ${formatBRL(vBdi)}`,
          `- Preço de venda: ${formatBRL(pv)}`,
          `- Custo realizado (medições): ${formatBRL(custoRealizado)}`,
          `- Avanço físico: ${formatBR(avanço, 1)}% (${isWeighted ? 'ponderado por valor' : 'média simples'})`,
          `- Itens no orçamento: ${orcamentoItens.length}`,
        ];

        if (custoRealizado > 0 && pv > 0) {
          const restante = cd * (1 - avanço / 100);
          const resultadoEstimado = pv - custoRealizado - restante;
          linhas.push(`- Custo restante previsto: ${formatBRL(restante)}`);
          linhas.push(`- Resultado final estimado: ${formatBRL(resultadoEstimado)} (estimativa, não garantido)`);
        } else {
          linhas.push('- Resultado final estimado: dados insuficientes (sem medições registradas)');
        }

        linhas.push('', 'Fonte: tabela orcamentos, orcamento_itens e medicoes.');

        if (orcamento.status !== 'aprovado') {
          linhas.push(`Observação: orçamento está em status "${orcamento.status}".`);
        }

        return linhas.join('\n');
      }

      // Tarefas atrasadas
      if (p.includes('atras') || p.includes('tarefa') || p.includes('cronograma')) {
        if (tarefas.length === 0) {
          return 'Não há tarefas cadastradas para esta obra. Crie tarefas na aba "Planejamento" para acompanhar o cronograma.';
        }

        const today = new Date();
        const atrasadas: string[] = [];
        const naoIniciadas: string[] = [];
        const emAndamento: string[] = [];

        for (const t of tarefas) {
          const end = new Date(t.data_fim);
          if (t.percentual_concluido < 100 && end < today) {
            const diasAtraso = daysBetween(end, today);
            atrasadas.push(`  - ${t.nome}: ${t.percentual_concluido}% concluído, prazo era ${end.toLocaleDateString('pt-BR')} (${diasAtraso} dias de atraso)`);
          } else if (t.percentual_concluido === 0) {
            naoIniciadas.push(`  - ${t.nome}: início previsto ${new Date(t.data_inicio).toLocaleDateString('pt-BR')}`);
          } else if (t.percentual_concluido < 100) {
            emAndamento.push(`  - ${t.nome}: ${t.percentual_concluido}% concluído`);
          }
        }

        const { percentual: avanço } = avançoFisico(tarefas.map(t => ({ percentual_concluido: t.percentual_concluido, valor_previsto: t.valor_previsto })));

        const linhas: string[] = [
          `Cronograma da obra "${projeto.nome}" (${tarefas.length} tarefas, avanço geral: ${formatBR(avanço, 1)}%):`,
          '',
        ];

        if (atrasadas.length > 0) {
          linhas.push(`Tarefas atrasadas (${atrasadas.length}):`);
          linhas.push(...atrasadas);
        } else {
          linhas.push('Nenhuma tarefa atrasada.');
        }

        if (emAndamento.length > 0) {
          linhas.push('', `Em andamento (${emAndamento.length}):`);
          linhas.push(...emAndamento);
        }

        if (naoIniciadas.length > 0) {
          linhas.push('', `Não iniciadas (${naoIniciadas.length}):`);
          linhas.push(...naoIniciadas.slice(0, 5));
        }

        // Check dependency conflicts
        const conflitos: string[] = [];
        for (const t of tarefas) {
          if (t.dependencia_id) {
            const dep = tarefas.find(x => x.id === t.dependencia_id);
            if (dep) {
              const taskStart = new Date(t.data_inicio);
              const depEnd = new Date(dep.data_fim);
              if (taskStart < depEnd) {
                conflitos.push(`  - "${t.nome}" inicia antes do término de "${dep.nome}"`);
              }
            }
          }
        }
        if (conflitos.length > 0) {
          linhas.push('', `Conflitos de dependência detectados (${conflitos.length}):`);
          linhas.push(...conflitos);
          linhas.push('', 'Observação: o sistema não realiza reagendamento automático. Avalie os conflitos manualmente.');
        }

        linhas.push('', 'Fonte: tabela tarefas.');

        return linhas.join('\n');
      }

      // Diário de obra
      if (p.includes('diário') || p.includes('diario') || p.includes('ocorrência') || p.includes('obra hoje') || p.includes('impedimento')) {
        if (diarios.length === 0) {
          return 'Não há registros no diário de obra para esta obra. Crie registros na aba "Diário de Obra".';
        }

        const linhas: string[] = [
          `Diário de obra - registros recentes (${diarios.length} de um total consultado):`,
          '',
        ];

        for (const reg of diarios.slice(0, 3)) {
          linhas.push(`${new Date(reg.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}:`);
          if (reg.usuario?.nome) linhas.push(`  Responsável: ${reg.usuario.nome}`);
          if (reg.clima) linhas.push(`  Clima: ${reg.clima}`);
          if (reg.equipe) linhas.push(`  Equipe: ${reg.equipe}`);
          if (reg.ocorrencias) linhas.push(`  Ocorrências: ${reg.ocorrencias}`);
          if (reg.impedimentos) linhas.push(`  Impedimentos: ${reg.impedimentos}`);
          linhas.push('');
        }

        // Summarize impedimentos
        const comImpedimentos = diarios.filter(d => d.impedimentos);
        if (comImpedimentos.length > 0) {
          linhas.push(`Registros recentes com impedimentos: ${comImpedimentos.length}`);
        }

        linhas.push('Fonte: tabela diario_obra.');

        return linhas.join('\n');
      }

      // Resumo geral
      if (p.includes('resumo') || p.includes('geral') || p.includes('status') || p.includes('otimizar') || p.includes('sugest') || p.includes('melhorar') || p.includes('tudo')) {
        const linhas: string[] = [
          `Resumo da obra "${projeto.nome}":`,
          `- Cliente: ${projeto.cliente}`,
          `- Status: ${projeto.status.replace('_', ' ')}`,
          '',
        ];

        if (projeto.data_inicio && projeto.data_termino) {
          const today = new Date();
          const termino = new Date(projeto.data_termino);
          const diasRestantes = daysBetween(today, termino);
          linhas.push(`- Início: ${new Date(projeto.data_inicio).toLocaleDateString('pt-BR')}`);
          linhas.push(`- Término previsto: ${termino.toLocaleDateString('pt-BR')}`);
          linhas.push(`- Dias restantes: ${diasRestantes > 0 ? diasRestantes : 0}${diasRestantes < 0 ? ' (atrasado)' : ''}`);
        } else {
          linhas.push('- Datas: não definidas');
        }

        linhas.push(`- Tarefas: ${tarefas.length} cadastradas, ${tarefas.filter(t => t.percentual_concluido === 100).length} concluídas`);

        if (tarefas.length > 0) {
          const { percentual: avanço, isWeighted } = avançoFisico(tarefas.map(t => ({ percentual_concluido: t.percentual_concluido, valor_previsto: t.valor_previsto })));
          linhas.push(`- Avanço físico: ${formatBR(avanço, 1)}% (${isWeighted ? 'ponderado' : 'média simples'})`);
        }

        if (orcamento && orcamentoItens.length > 0) {
          const cd = calcCustoDireto(orcamentoItens.map(i => ({ quantidade: i.quantidade, custo_unitario: i.custo_unitario })));
          const pv = precoVenda(cd, orcamento.bdi_taxa);
          linhas.push(`- Orçamento: ${formatBRL(pv)} (preço de venda, BDI ${formatBR(orcamento.bdi_taxa)}%)`);
          linhas.push(`- Status do orçamento: ${orcamento.status}`);
        } else {
          linhas.push('- Orçamento: não cadastrado');
        }

        linhas.push(`- Diário de obra: ${diarios.length} registros recentes`);
        linhas.push(`- Medições: ${medicoes.length} registradas`);

        if (medicoes.length === 0 && tarefas.length === 0 && !orcamento) {
          linhas.push('', 'Esta obra ainda não tem dados suficientes para análise. Comece cadastrando o orçamento, tarefas e registros do diário.');
        }

        linhas.push('', 'Fonte: tabelas projetos, tarefas, orcamentos, orcamento_itens, diario_obra e medicoes.');

        return linhas.join('\n');
      }

      // Default
      return 'Posso consultar dados reais da obra selecionada. Tente perguntar sobre:\n- Status financeiro / orçamento / BDI\n- Tarefas atrasadas / cronograma\n- Diário de obra recente / impedimentos\n- Resumo geral da obra\n\nTodas as respostas são baseadas nos dados cadastrados no sistema, não em estimativas.';
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      return `Erro ao consultar dados da obra: ${msg}. Tente novamente.`;
    }
  };

  const handleSend = async (text?: string) => {
    const mensagem = text || input;
    if (!mensagem.trim()) return;

    setMensagens((prev) => [...prev, { role: 'user', content: mensagem }]);
    setInput('');
    setLoading(true);

    const resposta = await gerarResposta(mensagem);
    setMensagens((prev) => [...prev, { role: 'assistant', content: resposta }]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-h-[800px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 text-white mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg">Resumo Automático</h3>
            <p className="text-slate-400 text-xs">Consultas baseadas nos dados reais da obra selecionada</p>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs text-slate-400">Dados reais</span>
          </div>
        </div>
      </div>

      {noProjeto && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Nenhuma obra selecionada</p>
            <p className="text-xs text-blue-600 mt-0.5">Selecione uma obra em qualquer módulo para que o assistente possa consultar seus dados.</p>
          </div>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {mensagens.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'assistant'
                    ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
                    : 'bg-slate-200'
                }`}
              >
                {msg.role === 'assistant' ? <Bot className="w-4 h-4 text-white" /> : <User className="w-4 h-4 text-slate-600" />}
              </div>
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-line ${
                  msg.role === 'assistant'
                    ? 'bg-slate-50 text-slate-700 rounded-tl-none'
                    : 'bg-emerald-500 text-white rounded-tr-none'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="px-4 py-3 bg-slate-50 rounded-2xl rounded-tl-none">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        {mensagens.length <= 1 && (
          <div className="px-6 pb-3 flex flex-wrap gap-2">
            {sugestoes.map((s, i) => {
              const SIcon = s.icon;
              return (
                <button
                  key={i}
                  onClick={() => handleSend(s.text)}
                  disabled={noProjeto}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-medium text-slate-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <SIcon className="w-3.5 h-3.5" />
                  {s.text}
                </button>
              );
            })}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Pergunte sobre a obra, cronograma, custos..."
              className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
