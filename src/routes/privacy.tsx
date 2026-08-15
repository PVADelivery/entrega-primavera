import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, ArrowLeft, MapPin, Smartphone, UserCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Política de Privacidade — MT 24 Horas Entregador" }] }),
  component: DriverPrivacyPage,
});

function DriverPrivacyPage() {
  const navigate = useNavigate();
  
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 pb-20">
      <div className="flex items-start sm:items-center gap-3 bg-card p-6 rounded-3xl border border-border/40 shadow-sm relative">
        <button 
          onClick={() => navigate({ to: '/driver/profile' })}
          className="absolute top-4 right-4 sm:static sm:mr-2 p-2 bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-full transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="pr-10 sm:pr-0">
          <h1 className="font-display text-2xl font-black">Política de Privacidade</h1>
          <p className="text-xs text-muted-foreground mt-0.5">MT 24 Horas Express — App do Entregador & Motorista</p>
        </div>
      </div>
      
      <div className="bg-card p-6 sm:p-8 rounded-3xl border border-border/40 shadow-sm space-y-6 text-sm text-foreground/90 leading-relaxed">
        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <MapPin className="w-4 h-4 text-primary" />
            <h2>1. Coleta de Dados de Localização em Segundo Plano (GPS)</h2>
          </div>
          <p>
            O aplicativo <strong>MT 24 Horas Express Entregador</strong> coleta dados de localização precisa (GPS), inclusive em segundo plano ou com o app fechado, <strong>exclusivamente quando você está com o status ONLINE</strong>. Esses dados são necessários para:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 text-xs text-muted-foreground">
            <li>Distribuir entregas e corridas mais próximas de você em tempo real;</li>
            <li>Permitir o cálculo exato de distâncias e rotas até a loja e o cliente final;</li>
            <li>Garantir o acompanhamento seguro da entrega pelo cliente e pelo painel operacional.</li>
          </ul>
        </section>
        
        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <UserCheck className="w-4 h-4 text-primary" />
            <h2>2. Informações Cadastrais e Documentação</h2>
          </div>
          <p>
            Coletamos seu nome completo, CPF, número de telefone/WhatsApp, foto de perfil, dados do veículo e documentos necessários para validação de segurança e repasse dos ganhos operacionais.
          </p>
        </section>
        
        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Smartphone className="w-4 h-4 text-primary" />
            <h2>3. Compartilhamento Estritamente Operacional</h2>
          </div>
          <p>
            Durante uma corrida ou entrega ativa, apenas seu primeiro nome, modelo de veículo, placa e localização em tempo real são compartilhados com o estabelecimento solicitante e com o cliente que receberá o pedido. Seus dados cadastrais confidenciais (documentos) nunca são divulgados publicamente ou vendidos para terceiros.
          </p>
        </section>
        
        <section className="space-y-2">
          <div className="flex items-center gap-2 font-bold text-foreground text-base">
            <Lock className="w-4 h-4 text-primary" />
            <h2>4. Segurança e Exclusão de Dados</h2>
          </div>
          <p>
            Todas as comunicações e coordenadas trafegam via conexões criptografadas (HTTPS/WSS). Você pode desativar o rastreamento a qualquer momento mudando sua chave para <strong>OFFLINE</strong> ou solicitar a exclusão definitiva da sua conta e dados diretamente pelo app.
          </p>
        </section>
      </div>
    </div>
  );
}
