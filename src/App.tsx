/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Calculator, 
  Mail, 
  MessageCircle, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  ArrowRight,
  HelpCircle,
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

  // --- Deadline Logic for Section 3 ---
  const windowPrescription = useMemo(() => {
    // Janela prescricional mencionada no prompt: Março 2020 a Março 2025
    const startWindow = new Date(2020, 2, 1); // Março 2020
    const endWindow = new Date(2025, 2, 1); // Março 2025
    
    const totalDuration = endWindow.getTime() - startWindow.getTime();
    const elapsed = HOJE.getTime() - startWindow.getTime();
    const percentage = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
    
    return { percentage, startWindow, endWindow };
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
          itbiCorreto: Number(valorItbiPago), // Assume correto sob a nova lei para fins de simulação
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
        const teto = 50000; // Conforme solicitado: só se aplica até 50 mil
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
    }, 400);
  };

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-brand-amber selection:text-white">
      {/* --- Header / Hero --- */}
      <header className="relative bg-white pt-12 pb-24 px-6 overflow-hidden border-b border-gray-100">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <span className="inline-block px-3 py-1 bg-brand-amber/10 text-brand-amber text-xs font-bold tracking-widest uppercase mb-6">
                Direito Imobiliário & Tributário
              </span>
              <h1 className="text-4xl md:text-6xl text-brand-graphite leading-tight mb-8">
                Você pode ter pago ITBI a mais em <span className="italic">São José dos Campos</span>.
              </h1>
              <p className="text-lg text-gray-600 max-w-2xl leading-relaxed mb-10">
                Uma decisão histórica do STJ declarou ilegal a forma como a prefeitura calculava o imposto. 
                Se você comprou um imóvel até 31/12/2025, tem direito a receber a diferença de volta.
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="#calculadora" className="btn-primary flex items-center gap-2">
                  Calcular minha restituição <ArrowRight size={18} />
                </a>
                <a 
                  href="https://wa.me/5519993598714?text=Ol%C3%A1%2C%20vim%20de%20sua%20calculadora%20de%20ITBI%20em%20S%C3%A3o%20Jos%C3%A9%20Dos%20Campos.%20Gostaria%20de%20tirar%20algumas%20d%C3%BAvidas." 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-6 py-3 border border-brand-graphite/20 text-brand-graphite font-medium hover:bg-brand-graphite hover:text-white transition-all duration-300"
                >
                  <MessageCircle size={18} /> Falar com Especialista
                </a>
              </div>
            </motion.div>
          </div>

          <div className="lg:col-span-4 flex justify-center lg:justify-end">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative z-10 text-right">
                <img 
                  src="https://lh3.googleusercontent.com/d/10ohuYlo8Uf3BT3AfaAmgjaVLc6of0Pjo" 
                  alt="Matheus Ximendes" 
                  className="w-40 h-40 rounded-full object-cover border-4 border-white shadow-2xl mb-4 ml-auto grayscale hover:grayscale-0 transition-all duration-500"
                  referrerPolicy="no-referrer"
                />
                <h3 className="text-xl font-serif text-brand-graphite">Matheus Ximendes</h3>
                <p className="text-brand-amber font-medium text-sm">OAB/SP 542.856</p>
                <p className="text-gray-500 text-xs uppercase tracking-wider mt-1">Especialista em Direito Tributário</p>
              </div>
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-brand-amber/5 rounded-full -z-0" />
            </motion.div>
          </div>
        </div>
      </header>

      {/* --- Section 2: Explanation --- */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <h2 className="text-3xl text-brand-graphite sticky top-12">O que aconteceu?</h2>
            </div>
            <div className="md:col-span-8 space-y-8 text-gray-700 leading-relaxed">
              <p>
                O ITBI é o imposto pago na compra de imóvel, de competência municipal. Em São José dos Campos, a <strong>LC 383/09, art. 8°</strong> determinava que a base de cálculo fosse o maior valor entre o valor pago e o valor da Planta Genérica de Valores (PGV) — a tabela interna da prefeitura.
              </p>
              <div className="p-6 bg-brand-cream border-l-4 border-brand-amber italic">
                "Em fevereiro de 2022, o STJ julgou o <strong>Tema Repetitivo 1.113</strong> (REsp 1.937.821/SP) e definiu que isso é ilegal: a base de cálculo deve ser o valor declarado pelo contribuinte (art. 38 do CTN), e a prefeitura só pode contestar mediante processo administrativo com contraditório (art. 148 do CTN)."
              </div>
              <p>
                A própria Prefeitura de SJC reconheceu isso publicamente em agosto de 2025, ao enviar à Câmara o projeto de reforma, declarando que a mudança "adequa o Município às decisões judiciais proferidas sobre o tema".
              </p>
              <p>
                A nova lei (<strong>LC 696/2025</strong>) foi aprovada em setembro de 2025 e corrigiu o sistema — mas só entrou em vigor em 01/01/2026. Quem pagou ITBI sobre a PGV até 31/12/2025 tem direito à repetição de indébito — devolução da diferença corrigida pela taxa Selic.
              </p>
              <div className="flex items-start gap-4 p-4 bg-red-50 text-red-800 rounded-sm">
                <AlertCircle className="shrink-0 mt-1" size={20} />
                <p className="text-sm">
                  <strong>O prazo para agir é de 5 anos contados do pagamento (art. 168, I, do CTN)</strong>. Cada dia que passa, uma fatia da janela de oportunidade se fecha definitivamente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --- Section 3: Visual Deadline --- */}
      <section className="py-16 px-6 bg-brand-cream">
        <div className="max-w-4xl mx-auto text-center">
          <h3 className="text-2xl mb-4">A janela que se fecha</h3>
          <p className="text-gray-600 mb-10">A janela prescricional está encolhendo. Veja quanto tempo resta para agir:</p>
          
          <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden mb-4">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${windowPrescription.percentage}%` }}
              transition={{ duration: 2, ease: "easeOut" }}
              className="absolute top-0 left-0 h-full bg-brand-amber"
            />
          </div>
          
          <div className="flex justify-between text-xs font-bold text-gray-500 uppercase tracking-widest">
            <span>Abril/2021</span>
            <span className="text-brand-amber">Hoje ({HOJE.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })})</span>
            <span>Dezembro/2025</span>
          </div>
          
          <p className="mt-8 text-sm text-gray-500">
            *Pagamentos realizados há mais de 5 anos já prescreveram.
          </p>
        </div>
      </section>

      {/* --- Section 4: Calculator --- */}
      <section id="calculadora" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl mb-4">Calculadora Interativa</h2>
            <p className="text-gray-600">Estime o valor que você pode ter direito a receber de volta.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Form */}
            <div className="card">
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

                {tipoTransacao === 'sfh_financed' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                  >
                    <label htmlFor="financiado">Valor financiado (R$)</label>
                    <input 
                      type="number" 
                      id="financiado" 
                      placeholder="Ex: 200000"
                      value={valorFinanciado}
                      onChange={(e) => setValorFinanciado(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </motion.div>
                )}

                <button 
                  onClick={calculate}
                  disabled={isCalculating}
                  className="w-full btn-primary flex justify-center items-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCalculating ? (
                    <>Processando...</>
                  ) : (
                    <>
                      <Calculator size={18} /> Calcular Estimativa
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Results */}
            <div className="relative">
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card border-brand-amber/30 h-full flex flex-col justify-between"
                  >
                    {result.diferenca <= 0 ? (
                      <div className="text-center py-12 px-6">
                        {result.isNovaLei ? (
                          <>
                            <CheckCircle2 className="mx-auto text-green-500 mb-6" size={56} />
                            <h3 className="text-xl text-brand-graphite mb-4">Nova Lei em Vigor</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              Seu pagamento foi realizado após 01/01/2026, sob a vigência da <strong>LC 696/2025</strong>. 
                              Nesta data, a prefeitura já havia adequado a cobrança às decisões do STJ, utilizando o valor da operação como base. 
                              Não há valores retroativos a restituir por este motivo.
                            </p>
                          </>
                        ) : result.baseUtilizada === 'menor' ? (
                          <>
                            <AlertCircle className="mx-auto text-amber-500 mb-6" size={56} />
                            <h3 className="text-xl text-brand-graphite mb-4">Pagamento Abaixo do Padrão</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              O valor pago ({formatCurrency(result.itbiCobrado)}) é inferior ao que seria devido com base no valor da operação ({formatCurrency(result.itbiCorreto)}). 
                              Neste caso, não há valores a restituir, pois você já pagou menos do que o padrão legal.
                            </p>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mx-auto text-green-500 mb-6" size={56} />
                            <h3 className="text-xl text-brand-graphite mb-4">Tudo em Ordem</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                              Identificamos que o seu ITBI foi calculado corretamente com base no valor real da operação. 
                              Você não foi cobrado pela PGV ilegal e, portanto, não possui valores a restituir.
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
                        {result.baseUtilizada === 'pgv' && (
                          <div className="flex justify-between text-sm border-b border-gray-100 pb-2">
                            <span className="text-gray-500">PGV Estimada:</span>
                            <span className="font-medium">{formatCurrency(result.pgvEstimado)}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-2">
                          <span className="text-brand-graphite font-bold">Valor a restituir:</span>
                          <span className="text-xl font-bold text-brand-amber">{formatCurrency(result.diferenca)}</span>
                        </div>
                      </div>

                      <div className="bg-brand-cream p-6 rounded-sm mb-8 text-center">
                        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Valor Estimado com Correção</p>
                        <p className="text-3xl font-bold text-brand-graphite">
                          {formatCurrency(result.valorCorrigido)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-2 italic text-balance">
                          *Apenas para referência (Selic estimada). O valor a restituir é {formatCurrency(result.diferenca)} sem juros.
                        </p>
                      </div>

                        <div className="space-y-3">
                          <div className={`flex items-center gap-2 text-sm ${result.statusColor}`}>
                            <Clock size={16} />
                            <span>{result.statusPrazo}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar size={16} />
                            <span>Data-limite para ajuizar: <strong>{result.dataLimite}</strong></span>
                          </div>
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
                    className="card border-dashed border-gray-300 h-full flex flex-col items-center justify-center text-center text-gray-400"
                  >
                    <Calculator size={48} className="mb-4 opacity-20" />
                    <p>Preencha os dados ao lado para visualizar sua estimativa.</p>
                  </motion.div>
                )}
              </AnimatePresence>
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
