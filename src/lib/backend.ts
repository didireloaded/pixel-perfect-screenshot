import { createBackend } from "../../shared/backend";
const backend = createBackend("manager");
export const backendMode = backend.configured ? "cloud" : "unconfigured";
export const authenticated = backend.hasSession;
export const {
  signIn,
  signInWorker,
  signOut,
  snapshot,
  command,
  resendConfirmation,
  resetPassword,
  updatePassword,
  onAuthChange,
  watch,
  replaceWorkerCode,
  uploadReport,
  uploadCompanyLogo,
  reportDocumentUrl,
  reportInterpretation,
  punctuality,
  jobAcknowledgements,
  leaveChanges,
  attendanceContext,
  availability,
  taskTemplates,
  knowledge,
  profileChanges,
} = backend;
