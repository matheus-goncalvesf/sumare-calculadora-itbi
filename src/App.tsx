/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  Mail, 
  MessageCircle, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Info
} from 'lucide-react';

// --- Types ---
type TransactionType = 'standard' | 'sfh_financed';

interface CalculationResult {
  itbiCobrado: number;
  itbiCorreto: number;
  diferenca: number;
  valorCorrigido: number;
  statusPrazo: string;
  statusColor: string;
  diasRestantes: number;
  dataLimite: string;
  pgvEstimado: number;
  baseUtilizada: 'escritura' | 'pgv' | 'menor';
}

export default function App() {
  // --- State ---
  const [dataPagamento, setDataPagamento] = useState('');
  const [valorEscritura, setValorEscritura] = useState<number | ''>('');
  const [valorEntrada, setValorEntrada] = useState<number | ''>('');
  const [valorFinanciado, setValorFinanciado] = useState<number | ''>('');
  const [valorItbiPago, setValorItbiPago] = useState<number | ''>('');
  const [tipoTransacao, setTipoTransacao] = useState<TransactionType>('standard');
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const resultsRef = useRef<HTMLDivElement>(null);

  // --- Handlers for correlated values ---
  const handleValorEscrituraChange = (val: number | '') => {
    setValorEscritura(val);
    if (val !== '' && valorFinanciado !== '') {
      setValorEntrada(val - Number(valorFinanciado));
    } else if (val !== '' && tipoTransacao === 'standard') {
      setValorEntrada(val);
      setValorFinanciado(0);
    }
  };

  const handleValorFinanciadoChange = (val: number | '') => {
    setValorFinanciado(val);
    if (valorEscritura !== '' && val !== '') {
      setValorEntrada(Number(valorEscritura) - val);
    }
  };

  const handleValorEntradaChange = (val: number | '') => {
    setValorEntrada(val);
    if (valorEscritura !== '' && val !== '') {
      setValorFinanciado(Number(valorEscritura) - val);
    }
  };

  // Clear result when inputs change to avoid stale data
  useEffect(() => {
    setResult(null);
  }, [dataPagamento, valorEscritura, valorEntrada, valorFinanciado, valorItbiPago, tipoTransacao]);

  // --- Constants ---
  const HOJE = new Date();
  const SELIC_PROXY = 0.01; // 1% ao mês estimado

  // --- Deadline Logic ---
  const windowPrescription = useMemo(() => {
    // A data que está prescrevendo exatamente hoje (5 anos atrás)
    const prescriptionLine = new Date(HOJE.getFullYear() - 5, HOJE.getMonth(), HOJE.getDate());
    
    return { prescriptionLine };
  }, []);

  // --- Calculator Logic ---
  const calculate = () => {
    const newErrors: string[] = [];
    if (!dataPagamento) newErrors.push('dataPagamento');
    if (!valorEscritura) newErrors.push('valorEscritura');
    if (!valorItbiPago) newErrors.push('valorItbiPago');
    
    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors([]);
    const vEscritura = Number(valorEscritura);
    const vItbiPago = Number(valorItbiPago);
    const vFinanciado = Number(valorFinanciado || 0);

    setIsCalculating(true);

    // Simulate a small delay for better UX feedback
    setTimeout(() => {
      const pgDate = new Date(dataPagamento);

      // Alíquotas e Isenções Sumaré
      const aliquotaPadrao = 0.02; // 2%
      const aliquotaSFH = 0.01; // 1% sobre parte financiada

      let itbiCorreto = 0;

      // 1. Calcular ITBI Correto (Sempre baseado na Escritura)
      if (tipoTransacao === 'sfh_financed') {
        const baseFinanciadaCorreta = vFinanciado;
        const baseEntradaCorreta = vEscritura - vFinanciado;
        itbiCorreto = (baseFinanciadaCorreta * aliquotaSFH) + (baseEntradaCorreta * aliquotaPadrao);
      } else {
        itbiCorreto = vEscritura * aliquotaPadrao;
      }

      // 2. Estimar PGV a partir do ITBI Pago
      let pgvEstimado = vEscritura;
      let baseUtilizada: 'escritura' | 'pgv' | 'menor' = 'escritura';

      if (vItbiPago > itbiCorreto + 0.1) { 
        baseUtilizada = 'pgv';
        if (tipoTransacao === 'sfh_financed') {
          // A prefeitura acata o valor fixo financiado (que vem do contrato do banco) e 
          // joga todo o aumento da Pauta de Valores para a parcela restante (alíquota padrao 2%).
          const itbiFinanciado = vFinanciado * aliquotaSFH;
          const itbiSobrandoParaEntrada = vItbiPago - itbiFinanciado;
          const baseSobrandoEstimada = itbiSobrandoParaEntrada / aliquotaPadrao;
          pgvEstimado = vFinanciado + baseSobrandoEstimada;
        } else {
          pgvEstimado = vItbiPago / aliquotaPadrao;
        }
      } else if (vItbiPago < itbiCorreto - 0.1) {
        baseUtilizada = 'menor';
      }

      const diferenca = Math.max(0, vItbiPago - itbiCorreto);

      // Verificação de Prazo (5 anos do pagamento)
      const dataPrescricao = new Date(pgDate);
      dataPrescricao.setFullYear(pgDate.getFullYear() + 5);
      
      const diffTime = dataPrescricao.getTime() - HOJE.getTime();
      const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let statusPrazo = "";
      let statusColor = "";

      if (dataPrescricao < HOJE) {
        statusPrazo = "⚠️ Prazo encerrado — este pagamento já prescreveu";
        statusColor = "text-red-600";
      } else if (diasRestantes <= 180) {
        statusPrazo = `🔴 Urgente — prazo de prescrição próximo`;
        statusColor = "text-red-500 font-bold";
      } else if (diasRestantes <= 365) {
        statusPrazo = `🟡 Atenção — menos de 1 ano para o prazo final`;
        statusColor = "text-amber-600";
      } else {
        statusPrazo = `🟢 Dentro do prazo para restituição`;
        statusColor = "text-green-600";
      }

      // Correção Selic + Juros Mora (Proxy: 1% ao mês)
      const dateParts = dataPagamento.split('-');
      const pgYear = parseInt(dateParts[0], 10);
      const pgMonth = parseInt(dateParts[1], 10) - 1; // zero indexed
      
      const diffMeses = (HOJE.getFullYear() - pgYear) * 12 + (HOJE.getMonth() - pgMonth);
      const fator = Math.pow(1 + SELIC_PROXY, Math.max(0, diffMeses));
      const valorCorrigido = Math.max(0, diferenca) * fator;

      setResult({
        itbiCobrado: vItbiPago,
        itbiCorreto,
        diferenca,
        valorCorrigido,
        statusPrazo,
        statusColor,
        diasRestantes,
        dataLimite: dataPrescricao.toLocaleDateString('pt-BR'),
        pgvEstimado,
        baseUtilizada
      });
      setIsCalculating(false);

      // Auto-scroll to results on mobile
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }, 400);
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-brand-amber selection:text-white">
      {/* --- Header / Hero --- */}
      <header className="relative bg-white pt-12 pb-12 px-6 overflow-hidden border-b border-gray-100">
        <div className="max-w-6xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block px-3 py-1 bg-brand-amber/10 text-brand-amber text-xs font-bold tracking-widest uppercase mb-6">
              Direito Imobiliário & Tributário
            </span>
            <h1 className="text-4xl md:text-6xl text-brand-graphite leading-tight mb-6">
              Verifique se houve cobrança indevida de ITBI em <span className="italic">Sumaré-SP</span>.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed mb-8">
              Analise a base de cálculo do seu imposto e entenda se há valores pagos acima do decidido pelos tribunais superiores.
            </p>
          </motion.div>
        </div>
      </header>

      {/* --- Section 1: Calculator (High Conversion Placement) --- */}
      <section id="calculadora" className="py-12 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Form */}
            <div className="card shadow-xl border-t-4 border-brand-amber">
              <div className="space-y-6">
                <div>
                  <label htmlFor="data" className={errors.includes('dataPagamento') ? 'text-red-500' : ''}>
                    Data do pagamento do ITBI
                  </label>
                  <input 
                    type="date" 
                    id="data" 
                    className={errors.includes('dataPagamento') ? 'border-red-500 bg-red-50' : ''}
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                  />
                  {errors.includes('dataPagamento') && <p className="text-[10px] text-red-500 mt-1">Campo obrigatório</p>}
                </div>

                <div>
                  <label htmlFor="escritura" className={errors.includes('valorEscritura') ? 'text-red-500' : ''}>
                    Valor total da operação (R$)
                  </label>
                  <input 
                    type="number" 
                    id="escritura" 
                    placeholder="Ex: 350000"
                    className={errors.includes('valorEscritura') ? 'border-red-500 bg-red-50' : ''}
                    value={valorEscritura}
                    onChange={(e) => handleValorEscrituraChange(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {errors.includes('valorEscritura') && <p className="text-[10px] text-red-500 mt-1">Campo obrigatório</p>}
                </div>

                {tipoTransacao === 'sfh_financed' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="financiado">Valor financiado (R$)</label>
                      <input 
                        type="number" 
                        id="financiado" 
                        placeholder="Ex: 200000"
                        value={valorFinanciado}
                        onChange={(e) => handleValorFinanciadoChange(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label htmlFor="entrada">Parte não financiada (R$)</label>
                      <input 
                        type="number" 
                        id="entrada" 
                        placeholder="Ex: 150000"
                        value={valorEntrada}
                        onChange={(e) => handleValorEntradaChange(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-gray-100">
                  <label htmlFor="itbi_pago" className={errors.includes('valorItbiPago') ? 'text-red-500' : ''}>
                    Valor total do ITBI pago (R$)
                  </label>
                  <input 
                    type="number" 
                    id="itbi_pago" 
                    placeholder="Ex: 8400"
                    className={errors.includes('valorItbiPago') ? 'border-red-500 bg-red-50' : ''}
                    value={valorItbiPago}
                    onChange={(e) => setValorItbiPago(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {errors.includes('valorItbiPago') && <p className="text-[10px] text-red-500 mt-1">Campo obrigatório</p>}
                </div>

                <div>
                  <label htmlFor="tipo">Tipo de transação</label>
                  <select 
                    id="tipo" 
                    value={tipoTransacao}
                    onChange={(e) => setTipoTransacao(e.target.value as TransactionType)}
                  >
                    <option value="standard">Compra padrão (Alíquota 2%)</option>
                    <option value="sfh_financed">Financiamento SFH (1% sobre o financiado, 2% restante)</option>
                  </select>
                </div>

                {tipoTransacao === 'sfh_financed' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 bg-blue-50 text-blue-800 text-xs rounded-sm mb-4"
                  >
                    <p><strong>O que é SFH?</strong> É o Sistema Financeiro de Habitação. Geralmente usado em financiamentos da Caixa (como o <strong>Minha Casa Minha Vida</strong>) ou quando você utiliza o seu <strong>FGTS</strong> na compra. Possui alíquota reduzida de 1% sobre o valor financiado.</p>
                  </motion.div>
                )}

                <button 
                  onClick={calculate}
                  disabled={isCalculating}
                  className="w-full btn-primary flex justify-center items-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed py-5 text-lg"
                >
                  {isCalculating ? (
                    <>Processando...</>
                  ) : (
                    <>
                      <Calculator size={20} /> Simular análise de ITBI
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="relative" ref={resultsRef}>
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card border-brand-amber/30 h-full flex flex-col justify-between shadow-2xl"
                  >
                    {result.diferenca <= 0 ? (
                      <div className="text-center py-12 px-6">
                        {result.baseUtilizada === 'menor' ? (
                          <>
                            <AlertCircle className="mx-auto text-amber-500 mb-6" size={56} />
                            <h3 className="text-xl text-brand-graphite mb-4">Pagamento Abaixo do Padrão</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              O valor pago ({formatCurrency(result.itbiCobrado)}) é inferior ao que seria devido com base no valor da operação. 
                              Não há valores a restituir.
                            </p>
                          </>
                        ) : (
                          <>
                            <Info className="mx-auto text-blue-500 mb-6" size={56} />
                            <h3 className="text-xl text-brand-graphite mb-4">Sem diferença detectada</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              Com base nos valores informados, não identificamos diferença a restituir. 
                              Se tiver dúvida sobre os valores da sua guia, entre em contato.
                            </p>
                          </>
                        )}
                        <button 
                          onClick={() => setResult(null)}
                          className="mt-8 text-xs font-bold uppercase tracking-widest text-brand-amber hover:underline"
                        >
                          Fazer novo cálculo
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-6">
                          <CheckCircle2 className="text-green-500" />
                          <h3 className="text-xl">Resultado Estimado</h3>
                        </div>

                        <div className="space-y-4 mb-8">
                          <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                            <span className="text-gray-500">ITBI pago:</span>
                            <span className="font-medium">{formatCurrency(result.itbiCobrado)}</span>
                          </div>
                          <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                            <span className="text-gray-500">ITBI que deveria ser pago:</span>
                            <span className="font-medium">{formatCurrency(result.itbiCorreto)}</span>
                          </div>
                          <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                            <span className="text-gray-500">Base de cálculo utilizada:</span>
                            <span className={`font-medium ${result.baseUtilizada === 'pgv' ? 'text-red-500' : 'text-green-500'}`}>
                              {result.baseUtilizada === 'pgv' ? 'Pauta de Valores (Ilegal)' : 'Valor da Operação'}
                            </span>
                          </div>
                          {result.baseUtilizada === 'pgv' && (
                            <div className="flex justify-between text-sm border-b border-gray-100 pb-2 bg-red-50 p-2 rounded -mx-2 px-2 mt-2">
                              <span className="text-red-700 font-medium">↳ Base cobrada estimada da Prefeitura:</span>
                              <span className="font-bold text-red-700">{formatCurrency(result.pgvEstimado)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-4">
                            <span className="text-brand-graphite font-bold">Diferença estimada:</span>
                            <span className="text-xl font-bold text-brand-amber">{formatCurrency(result.diferenca)}</span>
                          </div>
                        </div>

                        <div className="bg-brand-cream p-6 rounded-sm mb-8 text-center border border-brand-amber/20">
                          <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Valor Estimado com Correção</p>
                          <p className="text-4xl font-bold text-brand-graphite">
                            {formatCurrency(result.valorCorrigido)}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-2 italic">
                            *Apenas para referência (Selic estimada).
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div className={`flex items-center gap-2 text-sm ${result.statusColor}`}>
                            <Clock size={16} />
                            <span>{result.statusPrazo}</span>
                          </div>
                          
                          <a 
                            href={`https://wa.me/5519993598714?text=Ol%C3%A1%2C%20Matheus.%20Acabei%20de%20usar%20sua%20calculadora%20de%20ITBI%20em%20Sumar%C3%A9%20e%20verifiquei%20uma%20poss%C3%ADvel%20diferen%C3%A7a%20de%20${formatCurrency(result.valorCorrigido)}%20no%20meu%20imposto.%20Gostaria%20de%20saber%20como%20proceder.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-[#25D366] text-white flex justify-center items-center gap-3 py-4 rounded-sm font-bold hover:bg-[#128C7E] transition-colors shadow-lg"
                          >
                            <MessageCircle size={20} /> Falar com um especialista
                          </a>
                        </div>
                      </div>
                    )}

                    <p className="text-[10px] text-gray-400 mt-8 italic leading-tight">
                      Este é apenas um cálculo estimativo. Os valores reais dependem da análise do caso concreto.
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="card border-dashed border-gray-300 h-full flex flex-col items-center justify-center text-center text-gray-400 min-h-[400px]"
                  >
                    <Calculator size={48} className="mb-4 opacity-20" />
                    <p className="max-w-[200px]">Preencha os dados ao lado para visualizar sua estimativa de restituição.</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* --- Section 2: Visual Deadline --- */}
      <section className="py-20 px-6 bg-brand-cream border-y border-gray-100">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="font-serif text-2xl text-brand-graphite mb-4">Atenção ao Prazo de Prescrição</h3>
          <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
            A restituição do ITBI só pode ser solicitada referente a pagamentos realizados nos últimos <strong>5 anos</strong>. Pagamentos anteriores a isso prescrevem e o valor fica definitivamente para o Município.
          </p>
          
          <div className="flex flex-col items-center">
            <div className="w-full max-w-2xl h-4 bg-gray-200 rounded-full flex overflow-hidden shadow-inner mb-4">
              <div className="bg-red-500 w-1/4 h-full flex justify-center items-center text-[10px] text-white font-bold" title="Mais de 5 anos atrás (Prescrito)">
                PRESCRITO
              </div>
              <div className="bg-green-500 w-3/4 h-full flex justify-center items-center text-[10px] text-white font-bold" title="Últimos 5 anos (Elegível)">
                ELEGÍVEL (ÚLTIMOS 5 ANOS)
              </div>
            </div>
            
            <div className="w-full max-w-2xl flex justify-between text-xs text-brand-graphite font-medium">
              <span className="text-gray-400">Passado distante</span>
              <span className="flex flex-col items-center relative text-red-600 font-bold">
                <span className="w-0.5 h-4 bg-red-600 relative -top-[14px]"></span>
                <span className="relative -top-2">Prescrevendo Hoje: {windowPrescription.prescriptionLine.toLocaleDateString('pt-BR')}</span>
              </span>
              <span>Hoje ({HOJE.toLocaleDateString('pt-BR')})</span>
            </div>
          </div>
        </div>
      </section>

      {/* --- Section 3: Explanation (Authority Section) --- */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <div className="sticky top-12 space-y-6">
                <h2 className="text-3xl text-brand-graphite">Entenda o embasamento jurídico</h2>
                <div className="relative flex flex-col md:items-start items-center">
                  <img 
                    src="https://lh3.googleusercontent.com/d/10ohuYlo8Uf3BT3AfaAmgjaVLc6of0Pjo" 
                    alt="Matheus Ximendes" 
                    className="w-36 h-36 rounded-full object-cover border-4 border-brand-amber shadow-lg"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-6 md:text-left text-center">
                    <p className="font-serif text-brand-graphite font-bold">Matheus Ximendes</p>
                    <p className="text-brand-amber text-xs font-bold">OAB/SP 542.856</p>
                    <p className="text-gray-500 text-[10px] uppercase tracking-wider mt-1 font-medium">Especialista em Direito Tributário</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-8 space-y-8 text-gray-700 leading-relaxed">
              <p>
                As leis da cidade de Sumaré, através do <strong>Código Tributário Municipal (CTM, em especial o Art. 188)</strong>, estipulam que o ITBI será cobrado com base no Valor Venal ou no valor estipulado pela Pauta de Valores elaborada pela prefeitura, não permitindo que a cobrança seja em valor inferior a esta Pauta em nenhuma hipótese.
              </p>
              <div className="p-6 bg-brand-cream border-l-4 border-brand-amber italic">
                "Essa imposição de base de cálculo mínima viola diretamente o entendimento do STJ (Tema 1.113), que definiu que a base de cálculo deve ser o valor real da operação declarado pelo comprador, e não uma tabela ou pauta arbitrária da prefeitura."
              </div>
              <p>
                A Prefeitura de Sumaré continua utilizando essa Pauta de Valores. Isso significa que muito provavelmente, se você realizou o pagamento baseado na base estipulada pela prefeitura, você pagou imposto a mais.
              </p>
              <p>
                <strong>O prazo para recuperar esse dinheiro é de 5 anos.</strong> Se você não entrar com o pedido judicial dentro desse prazo, o direito prescreve e o dinheiro fica definitivamente com o Município.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* --- Section 5: Contact --- */}
      <section className="py-24 px-6 bg-brand-graphite text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl mb-12">Fale com um especialista</h2>
          
          <div className="flex flex-col sm:flex-row justify-center gap-6 mb-16">
            <a 
              href="mailto:matheus.ximendes@adv.oabsp.org.br" 
              className="flex items-center justify-center gap-3 px-8 py-4 border border-white/20 hover:bg-white/10 transition-colors rounded-sm"
            >
              <Mail size={20} />
              <span>Contato por e-mail</span>
            </a>
            <a 
              href="https://wa.me/5519993598714?text=Ol%C3%A1%2C%20vim%20de%20sua%20calculadora%20de%20ITBI%20em%20Sumar%C3%A9.%20Gostaria%20de%20tirar%20algumas%20d%C3%BAvidas." 
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-3 px-8 py-4 border border-white/20 hover:bg-white/10 transition-colors rounded-sm"
            >
              <MessageCircle size={20} />
              <span>WhatsApp</span>
            </a>
          </div>

          <div className="space-y-2 opacity-60 text-sm">
            <p className="font-medium">Matheus Ximendes — Advogado Tributarista</p>
            <p>OAB/SP 542.856 — São Paulo, Brasil</p>
          </div>
        </div>
      </section>

      {/* --- Footer --- */}
      <footer className="py-8 px-6 bg-brand-graphite text-white/40 text-[10px] text-center border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <p className="mb-2 uppercase tracking-widest">Aviso Legal</p>
          <p>
            As informações desta página têm caráter exclusivamente informativo e não constituem consultoria jurídica. A análise do caso concreto é indispensável.
          </p>
        </div>
      </footer>

      {/* --- Floating WhatsApp Button --- */}
      <motion.a
        href="https://wa.me/5519993598714?text=Ol%C3%A1%2C%20vim%20de%20sua%20calculadora%20de%20ITBI%20em%20Sumar%C3%A9.%20Gostaria%20de%20tirar%20algumas%20d%C3%BAvidas."
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, scale: 0.5, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 2, duration: 0.5 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50 bg-[#25D366] text-white p-4 rounded-full shadow-2xl flex items-center justify-center group"
        aria-label="Falar no WhatsApp"
      >
        <MessageCircle size={28} fill="currentColor" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 transition-all duration-500 ease-in-out whitespace-nowrap font-bold text-sm">
          Dúvidas? Fale comigo
        </span>
      </motion.a>
    </div>
  );
}
