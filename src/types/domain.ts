export type MarketCode = "smartstore" | "coupang" | "11st";

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "dead_letter";

export interface CollectionJob {
  id: string;
  siteId: "aliexpress" | "taobao";
  searchUrl: string;
  status: JobStatus;
  createdAt: string;
}
