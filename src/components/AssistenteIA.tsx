import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, Lightbulb, TrendingUp, AlertTriangle, ClipboardList } from 'lucide-react';

interface Mensagem {
  role: 'user' | 'assistant';
  content: string;
}

const sugestoes = [
  { icon: TrendingUp, text: 'Qual o status financeiro da obra?' },
  { icon: AlertTriangle, text: 'Quais tarefas estão atrasadas?' },
  { icon: ClipboardList, text: 'Resumo do diário de obra de hoje' },
  { icon: Lightbulb, text: 'Sugestões para otimizar o cronograma' },
];

export default function AssistenteIA() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      role: 'assistant',
      content:
        'Olá! Sou o assistente de IA do BuildManager. Posso ajudar a analisar o status da obra, identificar atrasos, resumir o diário e sugerir otimizações. Como posso ajudar?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens, loading]);

  const handleSend = (text?: string) => {
    const mensagem = text || input;
    if (!mensagem.trim()) return;

    setMensagens((prev) => [...prev, { role: 'user', content: mensagem }]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      const resposta = gerarResposta(mensagem);
      setMensagens((prev) => [...prev, { role: 'assistant', content: resposta }]);
      setLoading(false);
    }, 800);
  };

  const gerarResposta = (pergunta: string): string => {
    const p = pergunta.toLowerCase();
    if (p.includes('financeiro') || p.includes('orçamento') || p.includes('custo') || p.includes('gasto')) {
      return 'Analisei os dados financeiros da obra:\n\n- Custo direto orçado: R$ 40.962,50\n- BDI aplicado: 25% (R$ 10.240,63)\n- Preço de venda: R$ 51.203,13\n- Total gasto até hoje: R$ 129.500,00 (70% do previsto)\n- Margem estimada: positiva, com 65% de conclusão física\n\nRecomendo atenção ao ritmo de gastos - o realizado está 5% abaixo do previsto, o que é positivo, mas a margem final dependerá do controle das etapas finais (pintura e acabamento).';
    }
    if (p.includes('atras') || p.includes('tarefa') || p.includes('cronograma')) {
      return 'Identifiquei as seguintes tarefas com possível atraso:\n\n1. Emboço e reboco (85% concluído) - dependência de alvenaria, pode atrasar a regularização do piso\n2. Regularização de piso (40%) - em andamento, mas abaixo do previsto de 58%\n3. Assentamento de porcelanato (0%) - não iniciada, aguarda regularização\n\nSugestão: adiantar a equipe de pintura paralelamente ao assentamento do porcelanato para recuperar o cronograma.';
    }
    if (p.includes('diário') || p.includes('diario') || p.includes('ocorrência') || p.includes('obra hoje')) {
      return 'Resumo do diário de obra mais recente (15/10/2026):\n\n- Clima: Ensolarado, 30°C\n- Equipe: 1 pedreiro + 1 servente + 1 encanador\n- Ocorrências: Alvenaria concluída. Início do emboço. Hidráulica 70% concluída.\n- Impedimentos: Faltam conexões para o banheiro social\n\nAção recomendada: providenciar as conexões do banheiro social para não bloquear a etapa de revestimento.';
    }
    if (p.includes('otimizar') || p.includes('sugest') || p.includes('melhorar')) {
      return 'Aqui estão minhas sugestões para otimizar o cronograma:\n\n1. Paralelizar pintura e assentamento de porcelanato (ambos têm equipes independentes)\n2. Antecipar o forro de gesso - pode iniciar antes do término do porcelanato\n3. Aumentar a equipe de regularização de piso para recuperar os 18% de defasagem\n4. Garantir que as conexões do banheiro cheguem antes do início do revestimento\n\nCom essas medidas, é possível recuperar 3-5 dias no cronograma total.';
    }
    return 'Posso ajudar com análises financeiras, status de tarefas, resumos do diário de obra e sugestões de otimização. Tente perguntar sobre o status financeiro, tarefas atrasadas, ou o diário de obra.';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] max-h-[800px]">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 text-white mb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Assistente de IA</h3>
            <p className="text-slate-400 text-xs">Análise inteligente de obras e cronogramas</p>
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {mensagens.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'assistant'
                    ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
                    : 'bg-slate-200'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <Bot className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-slate-600" />
                )}
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
                  className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-medium text-slate-600 transition-all"
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
