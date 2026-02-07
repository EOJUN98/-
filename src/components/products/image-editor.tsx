"use client";

import { useEffect, useMemo, useState } from "react";

import { updateProductMainImageAction } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ImageEditorProps {
  productId: string;
  initialImageUrl: string | null;
  onSaved?: (imageUrl: string) => void;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (src.startsWith("http://") || src.startsWith("https://")) {
      image.crossOrigin = "anonymous";
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 불러오지 못했습니다"));
    image.src = src;
  });
}

function normalizeRotation(rotation: number) {
  const normalized = rotation % 360;
  if (normalized < 0) {
    return normalized + 360;
  }
  return normalized;
}

async function buildCroppedPreview(src: string, zoom: number, rotation: number) {
  const image = await loadImage(src);
  const angle = normalizeRotation(rotation);
  const radians = (angle * Math.PI) / 180;

  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;

  const rotatedCanvas = document.createElement("canvas");
  const rotatedContext = rotatedCanvas.getContext("2d");
  if (!rotatedContext) {
    throw new Error("캔버스 컨텍스트를 생성하지 못했습니다");
  }

  if (angle === 90 || angle === 270) {
    rotatedCanvas.width = sourceHeight;
    rotatedCanvas.height = sourceWidth;
  } else {
    rotatedCanvas.width = sourceWidth;
    rotatedCanvas.height = sourceHeight;
  }

  rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
  rotatedContext.rotate(radians);
  rotatedContext.drawImage(image, -sourceWidth / 2, -sourceHeight / 2);

  const minSide = Math.min(rotatedCanvas.width, rotatedCanvas.height);
  const cropSide = minSide / Math.max(1, zoom);
  const sx = (rotatedCanvas.width - cropSide) / 2;
  const sy = (rotatedCanvas.height - cropSide) / 2;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = 1200;
  outputCanvas.height = 1200;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    throw new Error("출력 캔버스 컨텍스트를 생성하지 못했습니다");
  }

  outputContext.drawImage(
    rotatedCanvas,
    sx,
    sy,
    cropSide,
    cropSide,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height
  );

  return outputCanvas.toDataURL("image/jpeg", 0.92);
}

export function ImageEditor({ productId, initialImageUrl, onSaved }: ImageEditorProps) {
  const [sourceUrl, setSourceUrl] = useState(initialImageUrl ?? "");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImageUrl);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setSourceUrl(initialImageUrl ?? "");
    setPreviewUrl(initialImageUrl);
  }, [initialImageUrl]);

  const hasPreview = useMemo(() => Boolean(previewUrl), [previewUrl]);

  async function saveImage(url: string) {
    setSaving(true);
    setError(null);

    const result = await updateProductMainImageAction({
      id: productId,
      mainImageUrl: url
    });

    setSaving(false);

    if (!result.success) {
      setError(result.error);
      toast({
        title: "이미지 저장 실패",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    onSaved?.(result.product.mainImageUrl ?? url);
    setPreviewUrl(result.product.mainImageUrl ?? url);

    toast({
      title: "대표 이미지 저장 완료",
      description: "상품 대표 이미지가 업데이트되었습니다."
    });
  }

  async function handleGeneratePreview() {
    if (!sourceUrl.trim()) {
      setError("이미지 URL을 입력해주세요");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const cropped = await buildCroppedPreview(sourceUrl.trim(), zoom, rotation);
      setPreviewUrl(cropped);
    } catch (generateError) {
      const message =
        generateError instanceof Error
          ? generateError.message
          : "이미지 미리보기 생성에 실패했습니다";

      const hint =
        sourceUrl.startsWith("http")
          ? " 원본 서버 CORS 정책으로 인해 브라우저 편집이 차단될 수 있습니다."
          : "";

      setError(`${message}.${hint}`.trim());
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="space-y-2">
        <Label htmlFor="image-url">대표 이미지 URL</Label>
        <div className="flex gap-2">
          <Input
            id="image-url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://..."
          />
          <Button
            variant="outline"
            onClick={() => saveImage(sourceUrl.trim())}
            disabled={saving || !sourceUrl.trim()}
          >
            URL 저장
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label htmlFor="crop-zoom">줌 (중앙 정사각형 크롭)</Label>
          <Input
            id="crop-zoom"
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <p className="text-xs text-muted-foreground">현재 줌: {zoom.toFixed(1)}x</p>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRotation((prev) => prev - 90)}>
              좌회전
            </Button>
            <Button variant="outline" onClick={() => setRotation((prev) => prev + 90)}>
              우회전
            </Button>
            <Button onClick={handleGeneratePreview} disabled={processing || !sourceUrl.trim()}>
              {processing ? "생성 중..." : "크롭 미리보기"}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">회전: {normalizeRotation(rotation)}°</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">미리보기</p>
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border bg-muted">
            {hasPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl ?? ""} alt="preview" className="h-full w-full object-cover" />
            ) : (
              <p className="text-sm text-muted-foreground">미리보기가 없습니다</p>
            )}
          </div>
          <Button onClick={() => previewUrl && saveImage(previewUrl)} disabled={saving || !previewUrl}>
            {saving ? "저장 중..." : "미리보기 이미지 저장"}
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
