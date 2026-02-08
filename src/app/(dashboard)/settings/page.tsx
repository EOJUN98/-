import { MarketConfigPanel } from "@/components/settings/market-config-panel";
import { SourcingConfigPanel } from "@/components/settings/sourcing-config-panel";
import { getSourcingConfig } from "@/actions/settings";
import { getMarketConfigSummaries } from "@/lib/queries/settings";

export default async function SettingsPage() {
  const [{ data, error }, { data: sourcingConfig }] = await Promise.all([
    getMarketConfigSummaries(),
    getSourcingConfig(),
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">환경설정</h1>
        <p className="text-muted-foreground">
          마켓 API 연동, 수집 속도/수량 설정을 관리합니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <SourcingConfigPanel initialConfig={sourcingConfig} />
      <MarketConfigPanel initialConfigs={data} />
    </section>
  );
}
