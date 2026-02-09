REPORT_08_CS_MGMT
# [Report 08] CS Management & Claim Processing System
**Target:** Full Stack Developer
**Context:** Centralized Q&A Dashboard & Auto-Reply Templates

---

## 1. 개요 (Overview)
본 문서는 각 마켓(쿠팡, 스마트스토어, 11번가)의 고객 문의(Q&A)를 수집하여 통합 관리하고, 답변을 전송하는 **CS 통합 시스템**의 구현 상세다.
* **Core Tech:** Next.js Server Actions, TanStack Table.
* **Key Features:** 문의 통합 수집, 답변 템플릿(자주 쓰는 문구), 답변 상태 동기화.

## 2. 디렉토리 구조 (Directory Structure)
```text
src/
├── app/(dashboard)/cs/
│   ├── page.tsx                # CS 문의 목록 (Main)
│   └── templates/              # 답변 템플릿 관리 페이지
├── lib/cs/
│   ├── cs-syncer.ts            # 마켓별 문의 수집 로직
│   └── reply-sender.ts         # 답변 전송 로직
├── components/cs/
│   ├── cs-table.tsx            # 문의 목록 테이블
│   ├── reply-dialog.tsx        # 답변 작성 팝업
│   └── template-selector.tsx   # 템플릿 선택기
└── actions/
    └── cs-actions.ts           # CS 관련 Server Actions
    3. 데이터베이스 스키마 추가 (Schema Extension)
기존 cs_inquiries 테이블 외에, 답변 템플릿을 저장할 테이블이 필요하다.
-- [Table 7] 답변 템플릿 (CS Templates)
CREATE TABLE public.cs_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL, -- 템플릿 제목 (예: 배송지연 안내)
    content TEXT NOT NULL, -- 답변 내용
    shortcut_key VARCHAR(10), -- 단축키 (Optional)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- RLS 설정
ALTER TABLE public.cs_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own templates" ON public.cs_templates
    USING (auth.uid() = user_id);
    4. 핵심 모듈 구현 (Core Modules)
A. 문의 수집 엔진 (src/lib/cs/cs-syncer.ts)
마켓 API를 통해 "답변 대기" 상태의 문의글을 긁어온다.
import { createClient } from '@/lib/supabase/server';

// 스마트스토어 문의 조회 예시
async function fetchSmartStoreInquiries(config: any) {
  // API: GET /v1/customer-inquiries
  // status: UNANSWERED
  return [
    {
      inquiryId: '10001',
      writerId: 'customer1',
      title: '배송 언제 되나요?',
      content: '2주 지났는데 소식이 없어요.',
      date: new Date().toISOString(),
      productName: '나이키 운동화',
      isAnswered: false
    }
  ];
}

export async function syncCSInquiries(userId: string) {
  const supabase = createClient();
  
  // 1. 활성 마켓 설정 조회
  const { data: configs } = await supabase
    .from('user_market_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!configs) return;

  for (const config of configs) {
    let inquiries: any[] = [];
    
    // 2. 마켓별 수집 분기
    try {
      if (config.market_code === 'smartstore') {
        inquiries = await fetchSmartStoreInquiries(config);
      } 
      // else if (coupang) ...
    } catch (e) {
      console.error(`CS Sync Error (${config.market_code}):`, e);
      continue;
    }

    // 3. DB Upsert
    for (const item of inquiries) {
      await supabase.from('cs_inquiries').upsert({
        user_id: userId,
        market_config_id: config.id,
        inquiry_id: item.inquiryId,
        writer_id: item.writerId,
        title: item.title,
        content: item.content,
        inquiry_date: item.date,
        is_answered: item.isAnswered
        // product_name 등을 메타데이터로 저장 가능
      }, { onConflict: 'market_config_id, inquiry_id' });
    }
  }
}
B. 답변 전송 액션 (src/actions/cs-actions.ts)
사용자가 작성한 답변을 마켓 API로 전송하고, DB 상태를 업데이트한다.
"use server"

import { createClient } from '@/lib/supabase/server';
// import { sendReplyToSmartStore } from '@/lib/markets/smartstore';

export async function replyToInquiry(inquiryId: string, content: string) {
  const supabase = createClient();
  
  // 1. 문의 정보 조회
  const { data: inquiry } = await supabase
    .from('cs_inquiries')
    .select('*, user_market_configs(*)')
    .eq('id', inquiryId)
    .single();

  if (!inquiry) throw new Error("Inquiry not found");

  try {
    const config = inquiry.user_market_configs;

    // 2. 마켓 API 호출 (답변 전송)
    // if (config.market_code === 'smartstore') {
    //   await sendReplyToSmartStore(config, inquiry.inquiry_id, content);
    // }

    // 3. DB 업데이트 (답변 완료 처리)
    await supabase.from('cs_inquiries').update({
      reply_content: content,
      is_answered: true,
      answered_at: new Date().toISOString()
    }).eq('id', inquiryId);

    return { success: true };

  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function createTemplate(title: string, content: string) {
    const supabase = createClient();
    // 템플릿 생성 로직...
}
"use server"

import { createClient } from '@/lib/supabase/server';
// import { sendReplyToSmartStore } from '@/lib/markets/smartstore';

export async function replyToInquiry(inquiryId: string, content: string) {
  const supabase = createClient();
  
  // 1. 문의 정보 조회
  const { data: inquiry } = await supabase
    .from('cs_inquiries')
    .select('*, user_market_configs(*)')
    .eq('id', inquiryId)
    .single();

  if (!inquiry) throw new Error("Inquiry not found");

  try {
    const config = inquiry.user_market_configs;

    // 2. 마켓 API 호출 (답변 전송)
    // if (config.market_code === 'smartstore') {
    //   await sendReplyToSmartStore(config, inquiry.inquiry_id, content);
    // }

    // 3. DB 업데이트 (답변 완료 처리)
    await supabase.from('cs_inquiries').update({
      reply_content: content,
      is_answered: true,
      answered_at: new Date().toISOString()
    }).eq('id', inquiryId);

    return { success: true };

  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

export async function createTemplate(title: string, content: string) {
    const supabase = createClient();
    // 템플릿 생성 로직...
}
"use client"
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { replyToInquiry } from "@/actions/cs-actions";

export function ReplyDialog({ inquiry, open, onOpenChange }: any) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  // 템플릿 예시 데이터 (실제로는 fetch 필요)
  const templates = [
    { id: '1', title: '배송지연', content: '고객님, 해외 배송 특성상 통관이 지연되고 있습니다. 양해 부탁드립니다.' },
    { id: '2', title: '정품문의', content: '저희 샵은 100% 정품만 취급합니다. 안심하셔도 됩니다.' }
  ];

  const handleTemplateChange = (val: string) => {
    const tmpl = templates.find(t => t.id === val);
    if (tmpl) setContent(tmpl.content);
  };

  const handleSubmit = async () => {
    setLoading(true);
    await replyToInquiry(inquiry.id, content);
    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>문의 답변하기</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded text-sm">
            <p className="font-bold">Q. {inquiry.content}</p>
          </div>

          <Select onValueChange={handleTemplateChange}>
            <SelectTrigger>
              <SelectValue placeholder="자주 쓰는 답변 선택" />
            </SelectTrigger>
            <SelectContent>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Textarea 
            value={content} 
            onChange={(e) => setContent(e.target.value)} 
            placeholder="답변 내용을 입력하세요..." 
            rows={5}
          />
          
          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? '전송 중...' : '답변 전송'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
6. 개발 가이드 (Workflow)
DB 업데이트: cs_templates 테이블 생성 SQL 실행.

스케줄러 등록: 주문 수집과 마찬가지로 CS 수집도 Cron Job에 등록 (예: 30분 간격).

UI 구성:

좌측: 문의 목록 (미답변 건수 뱃지 표시).

우측/모달: 답변 작성 폼.

연동: 각 마켓별 Q&A API 문서를 참고하여 fetch 로직 구현. (쿠팡은 Inquiry API, 스마트스토어는 CustomerInquiry API 확인)

