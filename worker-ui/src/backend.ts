import { createBackend } from "../../shared/backend";
const backend = createBackend("worker");
export const {
  configured,
  hasSession,
  signIn,
  signOut,
  snapshot,
  command,
  resendConfirmation,
  resetPassword,
  updatePassword,
  onAuthChange,
  watch,
  signInWorker,
  registerWorker,
} = backend;
