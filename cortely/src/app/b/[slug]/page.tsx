import { notFound } from "next/navigation";
import { MapPin, Phone } from "lucide-react";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { Badge } from "@/components/ui/badge";
import { getShopBundle } from "@/lib/data";
import { formatPhoneBR } from "@/lib/utils";

export default async function ShopPage({
  params,
}: {
  params: { slug: string };
}) {
  const bundle = await getShopBundle(params.slug);
  if (!bundle) notFound();

  const { shop, barbers, services } = bundle;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-6 sm:px-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${shop.primary_color}33, transparent 45%), linear-gradient(180deg, #1c1917 0%, #09090b 100%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-0 grain opacity-10" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <Badge className="border-amber-500/30 text-amber-200">Cortely</Badge>
          <h1 className="mt-4 font-display text-4xl text-stone-50 sm:text-5xl">
            {shop.name}
          </h1>
          <p className="mt-3 max-w-xl text-stone-300">
            Escolha o serviço, o barbeiro e o horário. Confirmação no WhatsApp em
            um toque.
          </p>
          <div className="mt-6 flex flex-wrap gap-4 text-sm text-stone-400">
            {shop.address && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-400" />
                {shop.address}
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <Phone className="h-4 w-4 text-amber-400" />
              {formatPhoneBR(shop.phone)}
            </span>
          </div>
        </div>
      </section>

      <div className="mt-8">
        <BookingWizard shop={shop} barbers={barbers} services={services} />
      </div>
    </main>
  );
}
