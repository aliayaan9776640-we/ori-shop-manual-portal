import { Mail, MapPin, Phone, MessageCircle, Ship, ShoppingCart, Wrench, Truck, Globe2, PackageCheck } from "lucide-react";
import Logo, { LOGO_URL, LOGO_URL_BROTHERS } from "../components/Logo";

export default function ContactUs() {
  const services = [
    { icon: ShoppingCart, title: "Wholesale & Retail", text: "Daily business supply and retail services." },
    { icon: Ship, title: "Sri Lanka Imports", text: "Importing items from Sri Lanka to Maldives." },
    { icon: PackageCheck, title: "Pre-Order Any Item", text: "Customers can request items for pre-order." },
    { icon: Wrench, title: "Repair & Maintenance", text: "Vehicle and heavy vehicle repair services." },
    { icon: Truck, title: "Rental Services", text: "Heavy vehicles available for rent." },
  ];

  const branches = [
    {
      title: "ORI Brothers",
      location: "Male’, Maldives",
      address: "MA. Hazva / Male’",
      road: "Nikagas Magu",
      logo: LOGO_URL_BROTHERS,
    },
    {
      title: "ORI Barakah Store",
      location: "R. Ungoofaaru, Maldives",
      address: "Lucky Hart / Ground Floor",
      road: "Asrafee Goalhi",
      logo: LOGO_URL,
    },
    {
      title: "ORI Maintenance",
      location: "K. Thilafushi / Male’",
      address: "Vehicle & Heavy Vehicle",
      road: "Repairing Works",
      logo: LOGO_URL_BROTHERS,
    },
    {
      title: "ORI Renters",
      location: "K. Thilafushi",
      address: "Heavy Vehicles",
      road: "Rental Services",
      logo: LOGO_URL_BROTHERS,
    },
    {
      title: "ORI International",
      location: "Sri Lanka",
      address: "Colombo",
      road: "Malabe",
      logo: LOGO_URL_BROTHERS,
    },
  ];

  return (
    <div className="min-h-screen bg-[#fbf7ee] text-slate-900">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#11150d] via-[#20351f] to-[#b78325] px-4 py-12 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-8 md:grid-cols-[180px_1fr_180px]">
            <img src={LOGO_URL_BROTHERS} className="mx-auto h-36 w-36 rounded-full bg-white/10 object-contain p-2" />
            <div className="text-center">
              <h1 className="text-5xl font-black tracking-tight md:text-7xl">
                CONTACT <span className="text-yellow-400">US</span>
              </h1>
              <p className="mt-3 text-xl font-semibold text-yellow-100">Powered by</p>
              <h2 className="mt-1 text-4xl font-black">ORI BROTHERS</h2>
              <p className="mt-4 text-lg italic text-yellow-100">
                Your Trusted Partner in Business, Import & Services
              </p>
            </div>
            <img src={LOGO_URL} className="mx-auto h-36 w-36 rounded-full bg-white object-contain p-2" />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl space-y-10 px-4 py-10">
        <section className="grid gap-4 md:grid-cols-5">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="rounded-2xl border border-yellow-200 bg-white p-5 text-center shadow-sm">
                <Icon className="mx-auto h-9 w-9 text-[#b78325]" />
                <h3 className="mt-3 font-black text-[#20351f]">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.text}</p>
              </div>
            );
          })}
        </section>

        <section>
          <h2 className="mb-5 text-center text-3xl font-black text-[#20351f]">
            Our Branches & Offices
          </h2>
          <div className="grid gap-5 md:grid-cols-5">
            {branches.map((b) => (
              <div key={b.title} className="rounded-3xl border border-yellow-200 bg-white p-5 text-center shadow-sm">
                <img src={b.logo} className="mx-auto h-20 w-20 rounded-full object-contain" />
                <h3 className="mt-3 text-lg font-black text-[#20351f]">{b.title}</h3>
                <p className="mt-2 flex items-center justify-center gap-1 text-sm font-semibold text-slate-700">
                  <MapPin className="h-4 w-4 text-[#b78325]" /> {b.location}
                </p>
                <p className="mt-2 text-sm text-slate-600">{b.address}</p>
                <p className="text-sm text-slate-600">{b.road}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <ContactCard
            title="ORI Barakah Store"
            phone="9220222"
            sub="Same number for Phone, Viber & WhatsApp"
          />
          <ContactCard
            title="ORI Brothers"
            phone="9778840"
            sub="Same number for WhatsApp & Viber"
          />
          <div className="rounded-3xl border border-yellow-200 bg-white p-6 text-center shadow-sm">
            <Mail className="mx-auto h-10 w-10 text-[#b78325]" />
            <h3 className="mt-3 text-xl font-black text-[#20351f]">Mail Us</h3>
            <p className="mt-3 text-lg font-bold">sales@oribrothers.com</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-yellow-200 bg-white shadow-sm">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-3xl font-black text-[#20351f]">About Us</h2>
              <p className="mt-4 leading-7 text-slate-700">
                ORI Brothers is a trusted name in the Maldives, engaged in wholesale and retail business,
                importing quality products from Sri Lanka, vehicle and heavy vehicle rental, repairing and
                maintenance services. Our commitment is to provide the best quality products and services
                with customer satisfaction and trust as our top priority.
              </p>
              <p className="mt-4 text-lg font-semibold italic text-[#b78325]">
                “Quality You Can Trust, Service You Can Rely On.”
              </p>
            </div>
            <img
              src="/assets/contact-us-ori-brothers.jpeg"
              className="h-full max-h-[420px] w-full rounded-2xl object-cover"
              alt="ORI Brothers Contact"
            />
          </div>
        </section>

        <section className="rounded-3xl bg-gradient-to-r from-[#20351f] to-[#b78325] p-6 text-center text-white">
          <Globe2 className="mx-auto h-9 w-9" />
          <h2 className="mt-3 text-2xl font-black">Wholesale · Importing · Pre-Order · Repairing · Rental Services</h2>
        </section>
      </main>
    </div>
  );
}

function ContactCard({ title, phone, sub }: { title: string; phone: string; sub: string }) {
  return (
    <div className="rounded-3xl border border-yellow-200 bg-white p-6 text-center shadow-sm">
      <Phone className="mx-auto h-10 w-10 text-[#b78325]" />
      <h3 className="mt-3 text-xl font-black text-[#20351f]">{title}</h3>
      <p className="mt-3 text-4xl font-black text-orange-600">{phone}</p>
      <div className="mt-4 flex justify-center gap-3">
        <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-700">Phone</span>
        <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-bold text-purple-700">Viber</span>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">WhatsApp</span>
      </div>
      <p className="mt-3 text-sm text-slate-500">{sub}</p>
    </div>
  );
}