import { providerLabel } from "../../lib/utils";
import type { Provider } from "../../lib/types";

interface ProviderPillsProps {
  providers: Provider[];
  compact?: boolean;
}

export function ProviderPills({ providers, compact = false }: ProviderPillsProps) {
  if (!providers.length) {
    return <span className="provider-pill provider-pill--ghost">未覆盖 provider</span>;
  }

  return (
    <div className="provider-pills">
      {providers.map((provider) => (
        <span
          key={provider}
          className={`provider-pill provider-pill--${provider} ${compact ? "provider-pill--compact" : ""}`}
        >
          {providerLabel(provider)}
        </span>
      ))}
    </div>
  );
}
