import { MarketConfigPanel } from "@/components/settings/market-config-panel";
import { getMarketConfigSummaries } from "@/lib/queries/settings";

export default async function SettingsPage() {
  const { data, error } = await getMarketConfigSummaries();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">환경설정</h1>
        <p className="text-muted-foreground">
          마켓 API 연동 정보와 기본 배송/반품 정책을 관리합니다.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <MarketConfigPanel initialConfigs={data} />
    </section>
  );
}
