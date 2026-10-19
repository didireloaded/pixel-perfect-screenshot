export interface KnowledgeVersion {
  id: string;
  article_id: string;
  version: number;
  category: "article" | "policy";
  title: string;
  body: string;
  published: boolean;
  created_at: string;
}
export interface KnowledgeAcknowledgement {
  versionId: string;
  employeeId: string;
  employeeName: string;
  acknowledgedAt: string;
}
export interface KnowledgeResponse {
  entries: KnowledgeVersion[];
  acknowledgements: KnowledgeAcknowledgement[];
  employees: { id: string; name: string }[];
  me: string;
}
export type KnowledgeRpc = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<KnowledgeResponse>;
