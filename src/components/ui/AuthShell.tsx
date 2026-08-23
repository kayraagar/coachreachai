import { LogoTile, Wordmark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

/** Giriş / kayıt ekranlarının ortak çerçevesi. */
export function AuthShell({
  subtitle,
  children,
  footer,
}: {
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="relative z-[1] flex flex-1 items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      {/* markanın arkasındaki yumuşak hale */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{
          background:
            "radial-gradient(38rem 20rem at 50% -12%, color-mix(in oklab, var(--accent) 22%, transparent), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm">
        <div className="reveal mb-8 flex flex-col items-center text-center">
          <LogoTile size={56} className="mb-4" />
          <h1 className="text-2xl">
            <Wordmark />
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            {subtitle}
          </p>
        </div>

        <div className="reveal card card-glow p-6" style={{ ["--d" as string]: "80ms" }}>
          {children}
        </div>

        <p
          className="reveal mt-6 text-center text-sm"
          style={{ color: "var(--text-secondary)", ["--d" as string]: "160ms" }}
        >
          {footer}
        </p>
      </div>
    </main>
  );
}

export function AuthField({
  label,
  name,
  type,
  autoComplete,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="field"
      />
    </label>
  );
}
