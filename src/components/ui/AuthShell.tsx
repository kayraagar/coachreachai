import { IconSpark } from "./Icons";
import { ThemeToggle } from "./ThemeToggle";

/** Giriş / kayıt ekranlarının ortak çerçevesi. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="relative z-[1] flex flex-1 items-center justify-center px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="reveal mb-8 flex flex-col items-center text-center">
          <span
            className="mb-4 grid h-12 w-12 place-items-center rounded-2xl"
            style={{
              background: "linear-gradient(140deg, var(--accent), var(--series-3))",
              color: "var(--accent-contrast)",
              boxShadow: "var(--glow)",
            }}
          >
            <IconSpark className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight gradient-text">{title}</h1>
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
