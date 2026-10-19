export interface TaskTemplate {
  id: string;
  title: string;
  instructions: string;
  checklist: string[];
  createdAt: string;
}
export interface TaskTemplateData {
  templates: TaskTemplate[];
}
export type TaskTemplateRpc = (
  action: string,
  payload: Record<string, unknown>,
) => Promise<TaskTemplateData>;
