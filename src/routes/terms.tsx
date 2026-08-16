import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FileText, ArrowLeft, Handshake, Wallet, Ban, Scale } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Primavera Delivery Entregador" },
      { name: "description", content: "Termos de uso do aplicativo do entregador: cadastro, repasse de 75%, obrigacoes, condutas proibidas e encerramento de conta." },
      { property: "og:title", content: "Termos de Uso — Primavera Delivery Entregador" },
      { property: "og:description", content: "Regras de uso do app do entregador, repasses e responsabilidades." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 pb-20">
      <div className="flex items-start sm:items-center gap-3 bg-card p-6 rounded-3xl border border-border/40 shadow-sm relative">
        <button
          onClick={() => navigate({ to: "/driver/profile" })}
          className="absolute top-4 right-4 sm:static sm:mr-2 p-2 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
        <div className="pr-10 sm:pr-0">
          <h1 className="font-display text-2xl font-black">Termos de Uso</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Primavera Delivery — App do Entregador &amp; Motorista</p>
        </div>
      </div>

      <div className="bg-card p-6 sm:p-8 rounded-3xl border border-border/40 shadow-sm space-y-6 text-sm text-foreground/90 leading-relaxed">
        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Handshake className="w-4 h-4 text-primary" />
            <h2>1. Relacao entre as partes</h2>
          </div>
          <p>
            O aplicativo conecta entregadores e motoristas autonomos a estabelecimentos e clientes. Nao existe vinculo empregaticio: voce atua como prestador de servico independente, escolhendo livremente quando ficar online e quais chamados aceitar.
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Wallet className="w-4 h-4 text-primary" />
            <h2>2. Ganhos e repasses</h2>
          </div>
          <p>
            O entregador recebe <strong>75%</strong> do valor de cada entrega concluida e repassa <strong>25%</strong> para a central, referente ao uso da plataforma, suporte operacional e distribuicao de chamados. Os valores exibidos no painel Financeiro consideram apenas entregas com status concluido.
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Scale className="w-4 h-4 text-primary" />
            <h2>3. Obrigacoes do entregador</h2>
          </div>
          <ul className="list-disc list-inside space-y-1 ml-2 text-xs text-muted-foreground">
            <li>Manter documentos pessoais e do veiculo validos e atualizados;</li>
            <li>Cumprir a legislacao de transito e transportar os pedidos com seguranca;</li>
            <li>Manter dados cadastrais verdadeiros e o GPS ativo enquanto estiver online;</li>
            <li>Tratar clientes e lojistas com respeito e registrar ocorrencias pelo app.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Ban className="w-4 h-4 text-primary" />
            <h2>4. Condutas proibidas e encerramento</h2>
          </div>
          <p>
            Sao proibidos o uso de contas de terceiros, fraude em entregas, cancelamentos abusivos, cobranca de valores nao previstos e qualquer conduta discriminatoria ou agressiva. O descumprimento pode gerar suspensao ou encerramento definitivo da conta. Voce tambem pode encerrar sua conta a qualquer momento pelo proprio aplicativo.
          </p>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Scale className="w-4 h-4 text-primary" />
            <h2>5. Alteracoes destes termos</h2>
          </div>
          <p>
            Estes termos podem ser atualizados para refletir mudancas operacionais ou legais. O uso continuado do aplicativo apos a atualizacao representa concordancia com a versao vigente.
          </p>
        </section>
      </div>
    </div>
  );
}
