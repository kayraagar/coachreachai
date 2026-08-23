export const metadata = { title: "Çevrimdışı — YKS Koçluk" };

export default function OfflinePage() {
  return (
    <main className="relative z-[1] flex flex-1 items-center justify-center px-4 py-12">
      <div className="card reveal max-w-sm p-8 text-center">
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Bağlantı yok
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          İnternet bağlantın kesildi. Bağlantı geri geldiğinde kaldığın yerden devam
          edebilirsin — girdiğin kayıtlar sunucuda güvende.
        </p>
      </div>
    </main>
  );
}
