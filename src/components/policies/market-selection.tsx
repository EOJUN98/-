"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Store } from "lucide-react";
import { AVAILABLE_MARKETS } from "@/types/policy";

interface MarketSelectionProps {
  targetMarkets: string[];
  onChange: (markets: string[]) => void;
}

export function MarketSelection({ targetMarkets, onChange }: MarketSelectionProps) {
  function toggle(code: string) {
    if (targetMarkets.includes(code)) {
      onChange(targetMarkets.filter((m) => m !== code));
    } else {
      onChange([...targetMarkets, code]);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          전송 마켓 선택
        </CardTitle>
        <CardDescription>이 정책으로 상품을 전송할 마켓을 선택합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {AVAILABLE_MARKETS.map((market) => (
            <label
              key={market.code}
              className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition-colors ${
                targetMarkets.includes(market.code)
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={targetMarkets.includes(market.code)}
                onCheckedChange={() => toggle(market.code)}
              />
              <span className="text-sm font-medium">{market.label}</span>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
