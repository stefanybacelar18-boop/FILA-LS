import Link from "next/link";
import { ArrowRight, CalendarCheck2, Gift, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-6xl px-5 pb-16 pt-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 grain opacity-[0.05]" />

      <header className="relative flex items-center justify-between">
        <div className="font-display text-2xl tracking-tight text-stone-50">
          Cortely
        </div>
        <Link href="/admin">
          <Button variant="secondary" size="sm">
            Painel da barbearia
          </Button>
        </Link>
      </header>

      <section className="relative mt-16 grid items-center gap-12 lg:mt-24 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="animate-rise text-xs uppercase tracking-[0.28em] text-amber-400/80">
            SaaS para barbearias
          </p>
          <h1 className="animate-rise-delay mt-4 max-w-xl font-display text-5xl leading-[0.95] text-stone-50 sm:text-6xl">
            Agenda lotada.
            <span className="block text-amber-400">Cliente fiel.</span>
          </h1>
          <p className="animate-rise-delay-2 mt-6 max-w-lg text-lg text-stone-400">
            Agendamento em 3 passos, vitrine dark premium da sua marca, confirmação
            no WhatsApp e Barber Points nativo — sem cara de formulário genérico.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/b/navalha-negra">
              <Button size="lg" className="cta-glow">
                Testar demo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin">
              <Button size="lg" variant="outline">
                Abrir admin demo
              </Button>
            </Link>
          </div>
        </div>

        <div className="glass-panel relative overflow-hidden rounded-[2rem] p-6 animate-rise-delay">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
          <p className="text-sm text-stone-400">Demo pública</p>
          <h2 className="mt-2 font-display text-3xl text-stone-50">Navalha Negra</h2>
          <p className="mt-2 text-stone-400">
            Fluxo completo de cliente + painel do dono, em modo demo local.
          </p>
          <ul className="mt-6 space-y-4 text-sm text-stone-300">
            <li className="flex gap-3">
              <CalendarCheck2 className="mt-0.5 h-4 w-4 text-amber-400" />
              Reserva em menos de 45 segundos no celular
            </li>
            <li className="flex gap-3">
              <MessageCircle className="mt-0.5 h-4 w-4 text-amber-400" />
              Botão direto para confirmar no WhatsApp
            </li>
            <li className="flex gap-3">
              <Gift className="mt-0.5 h-4 w-4 text-amber-400" />
              Barber Points: a cada 5 cortes, recompensa no 6º
            </li>
          </ul>
        </div>
      </section>

      <section className="relative mt-24 grid gap-4 md:grid-cols-3">
        {[
          {
            title: "Dark premium",
            text: "Página do cliente com identidade da barbearia, não planilha com tema claro.",
          },
          {
            title: "Vitrine visual",
            text: "Barbeiros com foto, serviços com duração, preço e categorias claras.",
          },
          {
            title: "Isolado de verdade",
            text: "Projeto separado do FilaDock/FrotaTMS: pasta, Supabase e deploy próprios.",
          },
        ].map((item) => (
          <article
            key={item.title}
            className="glass-panel rounded-3xl p-6 transition hover:border-amber-500/30"
          >
            <h3 className="font-display text-xl text-stone-50">{item.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-stone-400">{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
