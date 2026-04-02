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
type TransactionType = 'standard' | 'sfh_financed' | 'first_property';

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
  isNovaLei?: boolean;
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
  const SELIC_PROXY = 0.006; // 0.6% ao mês

  // --- Deadline Logic ---
  const windowPrescription = useMemo(() => {
    // A janela total de pagamentos elegíveis é de Abril/2021 a Dezembro/2025.
    const START_WINDOW = new Date(2021, 3, 1); // 01/04/2021
    const END_WINDOW = new Date(2025, 11, 31); // 31/12/2025
    
    // A linha de prescrição hoje (pagamentos feitos há exatamente 5 anos)
    const prescriptionLine = new Date(HOJE.getFullYear() - 5, HOJE.getMonth(), HOJE.getDate());
    
    const totalDuration = END_WINDOW.getTime() - START_WINDOW.getTime();
    
    // Quanto do período já prescreveu (da data inicial até a linha de prescrição)
    const prescribedDuration = Math.max(0, prescriptionLine.getTime() - START_WINDOW.getTime());
    const prescribedPercentage = Math.min(100, (prescribedDuration / totalDuration) * 100);
    
    return { prescribedPercentage, prescriptionLine };
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
      const dataCorteNovaLei = new Date(2025, 11, 31); // 31/12/2025

      // Se o pagamento foi após a entrada em vigor da nova lei
      if (pgDate > dataCorteNovaLei) {
        setResult({
          itbiCobrado: Number(valorItbiPago),
          itbiCorreto: Number(valorItbiPago),
          diferenca: 0,
          valorCorrigido: 0,
          statusPrazo: "🟢 Pagamento realizado sob a nova LC 696/2025",
          statusColor: "text-green-600",
          diasRestantes: 1825, // 5 anos
          dataLimite: new Date(pgDate.getFullYear() + 5, pgDate.getMonth(), pgDate.getDate()).toLocaleDateString('pt-BR'),
          pgvEstimado: Number(valorEscritura),
          baseUtilizada: 'escritura',
          isNovaLei: true
        });
        setIsCalculating(false);
        return;
      }

      // Alíquotas e Isenções (LC 383/09)
      const aliquotaPadrao = 0.02;
      const aliquotaIsenta = 0.005; // 2% * 25% = 0.5% (isenção de 75%)

      let itbiCorreto = 0;

      // 1. Calcular ITBI Correto (Sempre baseado na Escritura)
      if (tipoTransacao === 'sfh_financed') {
        const baseFinanciadaCorreta = vFinanciado;
        const baseEntradaCorreta = vEscritura - vFinanciado;
        itbiCorreto = (baseFinanciadaCorreta * aliquotaIsenta) + (baseEntradaCorreta * aliquotaPadrao);
      } else if (tipoTransacao === 'first_property') {
        const teto = 50000;
        itbiCorreto = vEscritura <= teto ? vEscritura * aliquotaIsenta : vEscritura * aliquotaPadrao;
      } else {
        itbiCorreto = vEscritura * aliquotaPadrao;
      }

      // 2. Estimar PGV a partir do ITBI Pago
      let pgvEstimado = vEscritura;
      let baseUtilizada: 'escritura' | 'pgv' | 'menor' = 'escritura';

      if (vItbiPago > itbiCorreto + 0.1) { 
        baseUtilizada = 'pgv';
        if (tipoTransacao === 'sfh_financed') {
          const proporcaoFinanciada = vFinanciado / vEscritura;
          const aliquotaMedia = (proporcaoFinanciada * aliquotaIsenta) + ((1 - proporcaoFinanciada) * aliquotaPadrao);
          pgvEstimado = vItbiPago / aliquotaMedia;
        } else if (tipoTransacao === 'first_property') {
          const teto = 50000;
          const aliquotaEfetiva = vEscritura <= teto ? aliquotaIsenta : aliquotaPadrao;
          pgvEstimado = vItbiPago / aliquotaEfetiva;
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
        statusPrazo = `🔴 Urgente — restam ${diasRestantes} dias para agir`;
        statusColor = "text-red-500 font-bold";
      } else if (diasRestantes <= 365) {
        statusPrazo = `🟡 Atenção — restam menos de 1 ano`;
        statusColor = "text-amber-600";
      } else {
        statusPrazo = `🟢 Dentro do prazo — ${diasRestantes} dias restantes`;
        statusColor = "text-green-600";
      }

      // Correção Selic (Proxy: 0.6% ao mês)
      const diffMeses = (HOJE.getFullYear() - pgDate.getFullYear()) * 12 + (HOJE.getMonth() - pgDate.getMonth());
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
              Recupere o ITBI pago a mais em <span className="italic">São José dos Campos</span>.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed mb-8">
              Use nossa calculadora e descubra em segundos se você tem direito à restituição do imposto pago até 31/12/2025.
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
                    <option value="sfh_financed">Financiamento SFH (Art. 9º, II)</option>
                    <option value="first_property">Único imóvel abaixo do teto (Art. 9º, I)</option>
                  </select>
                </div>

                {tipoTransacao === 'first_property' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-3 bg-blue-50 text-blue-800 text-xs rounded-sm mb-4"
                  >
                    <p><strong>Nota:</strong> Isenção de 75% (alíquota efetiva 0,5%) se o valor for até R$ 50.000 (LC 383/09).</p>
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
                      <Calculator size={20} /> Calcular minha restituição
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
                        {result.isNovaLei ? (
                          <>
                            <CheckCircle2 className="mx-auto text-green-500 mb-6" size={56} />
                            <h3 className="text-xl text-brand-graphite mb-4">Nova Lei em Vigor</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              Seu pagamento foi realizado após 01/01/2026, sob a vigência da <strong>LC 696/2025</strong>. 
                              Nesta data, a prefeitura já havia adequado a cobrança às decisões do STJ.
                            </p>
                          </>
                        ) : result.baseUtilizada === 'menor' ? (
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
                              {result.baseUtilizada === 'pgv' ? 'PGV (Ilegal)' : 'Valor da Operação'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-brand-graphite font-bold">Valor a restituir:</span>
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
                            href={`https://wa.me/5519993598714?text=Ol%C3%A1%2C%20Matheus.%20Acabei%20de%20usar%20sua%20calculadora%20de%20ITBI%20de%20S%C3%A3o%20Jos%C3%A9%20dos%20Campos%20e%20encontrei%20uma%20estimativa%20de%20restitui%C3%A7%C3%A3o%20de%20${formatCurrency(result.valorCorrigido)}.%20Gostaria%20de%20saber%20como%20proceder.`}
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
      <section className="py-16 px-6 bg-brand-cream">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-2xl mb-4">Janela de Oportunidade</h3>
          <p className="text-gray-600 mb-10">O tempo está "comendo" seu direito. Pagamentos anteriores a {windowPrescription.prescriptionLine.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} já prescreveram.</p>
          
          <div className="relative pt-10 pb-4">
            {/* Moving Label */}
            <motion.div 
              initial={{ left: 0 }}
              animate={{ left: `${windowPrescription.prescribedPercentage}%` }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
            >
              <span className="text-[10px] font-bold text-red-600 bg-white px-2 py-1 rounded-full shadow-sm border border-red-100 whitespace-nowrap mb-1">
                Prescrevendo: {windowPrescription.prescriptionLine.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
              </span>
              <div className="w-0.5 h-4 bg-red-500" />
            </motion.div>

            <div className="relative h-6 bg-brand-amber rounded-full overflow-hidden border-2 border-white shadow-inner">
              {/* Prescribed Part (Gray) */}
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${windowPrescription.prescribedPercentage}%` }}
                transition={{ duration: 2, ease: "easeOut" }}
                className="absolute top-0 left-0 h-full bg-gray-300 flex items-center justify-end px-2"
              >
                <span className="text-[9px] font-bold text-gray-500 uppercase whitespace-nowrap">Prescrito</span>
              </motion.div>
              
              {/* Wall Indicator */}
              <div className="absolute top-0 right-0 h-full w-2 bg-brand-graphite" title="Parede: Nova Lei 01/01/2026" />
            </div>
          </div>
          
          <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            <div className="text-left">
              <p>Abril/2021</p>
              <p className="font-normal normal-case text-gray-400">Início do Período</p>
            </div>
            <div className="text-right">
              <p>01/01/2026</p>
              <p className="font-normal normal-case text-gray-400">Limite da Nova Lei</p>
            </div>
          </div>
          
          <p className="mt-8 text-sm text-gray-500 italic">
            *A parte <span className="text-brand-amber font-bold">âmbar</span> representa os pagamentos que você ainda pode recuperar. A parte <span className="text-gray-400 font-bold">cinza</span> já foi perdida para a prescrição de 5 anos.
          </p>
        </div>
      </section>

      {/* --- Section 3: Explanation (Authority Section) --- */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <div className="sticky top-12 space-y-6">
                <h2 className="text-3xl text-brand-graphite">Por que você tem esse direito?</h2>
                <div className="relative">
                  <img 
                    src="https://lh3.googleusercontent.com/d/10ohuYlo8Uf3BT3AfaAmgjaVLc6of0Pjo" 
                    alt="Matheus Ximendes" 
                    className="w-24 h-24 rounded-full object-cover border-2 border-brand-amber"
                    referrerPolicy="no-referrer"
                  />
                  <div className="mt-4">
                    <p className="font-serif text-brand-graphite font-bold">Matheus Ximendes</p>
                    <p className="text-brand-amber text-xs font-bold">OAB/SP 542.856</p>
                    <p className="text-gray-500 text-[10px] uppercase tracking-wider mt-1 font-medium">Especialista em Direito Tributário</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-8 space-y-8 text-gray-700 leading-relaxed">
              <p>
                Em São José dos Campos, a <strong>LC 383/09</strong> determinava que o ITBI fosse pago sobre o maior valor entre o valor da venda e a Planta Genérica de Valores (PGV).
              </p>
              <div className="p-6 bg-brand-cream border-l-4 border-brand-amber italic">
                "O STJ definiu (Tema 1.113) que a base de cálculo deve ser o valor real da operação declarado pelo comprador, e não uma tabela arbitrária da prefeitura."
              </div>
              <p>
                A nova <strong>LC 696/2025</strong> corrigiu esse erro, mas ela só entrou em vigor em 01/01/2026. Isso significa que todos os pagamentos feitos antes dessa data podem ter sido cobrados a mais de forma ilegal.
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
              href="https://wa.me/5519993598714?text=Ol%C3%A1%2C%20vim%20de%20sua%20calculadora%20de%20ITBI%20em%20S%C3%A3o%20Jos%C3%A9%20Dos%20Campos.%20Gostaria%20de%20tirar%20algumas%20d%C3%BAvidas." 
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
        href="https://wa.me/5519993598714?text=Ol%C3%A1%2C%20vim%20de%20sua%20calculadora%20de%20ITBI%20em%20S%C3%A3o%20Jos%C3%A9%20Dos%20Campos.%20Gostaria%20de%20tirar%20algumas%20d%C3%BAvidas."
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
