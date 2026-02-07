export interface CsInquiryListItem {
  id: string;
  inquiryId: string | null;
  marketCode: string | null;
  writerId: string | null;
  title: string | null;
  content: string | null;
  replyContent: string | null;
  isAnswered: boolean;
  inquiryDate: string | null;
  createdAt: string;
}

export interface CsTemplateItem {
  id: string;
  title: string;
  content: string;
  shortcutKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}
