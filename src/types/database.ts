export interface Insumo {
  id: string;
  codigo: string;
  nome: string;
  unidade: string;
  custo_unitario: number;
  origem: 'SINAPI' | 'Proprio';
  tipo: 'material' | 'mao_obra' | 'equipamento' | 'servico';
  created_at?: string;
}

export interface Composicao {
  id: string;
  codigo: string;
  nome: string;
  unidade: string;
  created_at?: string;
}

export interface ComposicaoInsumo {
  id: string;
  composicao_id: string;
  insumo_id: string;
  coeficiente: number;
  insumo?: Insumo;
}

export interface Projeto {
  id: string;
  nome: string;
  cliente: string;
  endereco: string | null;
  status: 'planejamento' | 'em_andamento' | 'pausado' | 'concluido' | 'cancelado';
  data_inicio: string | null;
  data_termino: string | null;
  valor_contrato: number;
  created_at?: string;
}

export interface EapItem {
  id: string;
  projeto_id: string;
  parent_id: string | null;
  codigo: string;
  nome: string;
  nivel: number;
  created_at?: string;
  children?: EapItem[];
}

export interface Orcamento {
  id: string;
  projeto_id: string;
  nome: string;
  bdi_taxa: number;
  status: 'rascunho' | 'aprovado' | 'revisao';
  created_at?: string;
  updated_at?: string;
}

export interface OrcamentoItem {
  id: string;
  orcamento_id: string;
  eap_item_id: string | null;
  composicao_id: string | null;
  descricao: string | null;
  quantidade: number;
  custo_unitario: number;
  created_at?: string;
  updated_at?: string;
  eap_item?: EapItem;
  composicao?: Composicao;
}

export interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  cidade: string | null;
  categorias: string[];
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface SolicitacaoCompra {
  id: string;
  projeto_id: string;
  descricao: string;
  categoria: 'material' | 'servico' | 'mao_obra' | 'equipamento';
  insumo_id: string | null;
  unidade: string;
  quantidade: number;
  data_necessaria: string | null;
  orcamento_referencia: number | null;
  status: 'aberta' | 'cotando' | 'aprovada' | 'cancelada' | 'entregue';
  created_at?: string;
  updated_at?: string;
  insumo?: Insumo;
}

export interface Proposta {
  id: string;
  projeto_id: string;
  solicitacao_id: string;
  fornecedor_id: string;
  numero: string | null;
  data_proposta: string | null;
  validade: string | null;
  frete: number;
  impostos_adicionais: number;
  desconto_global: number;
  prazo_entrega: string | null;
  condicao_pagamento: string | null;
  observacoes: string | null;
  status: 'recebida' | 'em_analise' | 'aprovada' | 'rejeitada' | 'vencida';
  import_hash: string | null;
  pdf_path: string | null;
  created_at?: string;
  updated_at?: string;
  fornecedor?: Fornecedor;
  solicitacao?: SolicitacaoCompra;
  itens?: PropostaItem[];
}

export interface PropostaItem {
  id: string;
  proposta_id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unitario: number;
  desconto: number;
  ordem: number;
  created_at?: string;
}

export interface CompraAprovacao {
  id: string;
  proposta_id: string;
  usuario_id: string | null;
  justificativa: string;
  custo_total_aprovado: number;
  economia_aprovada: number | null;
  created_at?: string;
}

export interface PropostaFornecedor {
  id: string;
  insumo_id: string;
  fornecedor_id: string;
  preco: number;
  prazo_entrega: string | null;
  data_cotacao: string;
  insumo?: Insumo;
  fornecedor?: Fornecedor;
}

export interface Tarefa {
  id: string;
  projeto_id: string;
  eap_item_id: string | null;
  nome: string;
  data_inicio: string;
  data_fim: string;
  dependencia_id: string | null;
  percentual_concluido: number;
  valor_previsto: number;
  created_at?: string;
  updated_at?: string;
  dependencia?: Tarefa | null;
}

export interface Medicao {
  id: string;
  projeto_id: string;
  tarefa_id: string | null;
  data: string;
  percentual_previsto: number;
  percentual_realizado: number;
  valor_previsto: number;
  valor_realizado: number;
  created_at?: string;
}

export interface DiarioObra {
  id: string;
  projeto_id: string;
  usuario_id: string | null;
  data: string;
  clima: string | null;
  equipe: string | null;
  ocorrencias: string | null;
  impedimentos: string | null;
  created_at?: string;
  updated_at?: string;
}
