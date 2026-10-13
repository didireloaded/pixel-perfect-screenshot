export interface WorkerProfile {
  fullName: string;
  phone: string;
}

export interface WorkerCredentials {
  employeeNo: string;
  accessCode: string;
}

// The internal identifier is only for Supabase password authentication, never contact email.
export function workerLoginEmail(employeeNo: string) {
  const number = employeeNo.trim().toUpperCase();
  if (!/^SL-[0-9]{6,12}$/.test(number))
    throw new Error("Enter your employee number (SL- followed by digits).");
  return `${number.toLowerCase()}@workers.shiftline.invalid`;
}

export function validateWorkerPassword(password: string) {
  if (password.length !== 8) throw new Error("Use exactly 8 characters for your password.");
}

export function normalizeWorkerProfile(profile: WorkerProfile): WorkerProfile {
  const fullName = profile.fullName.trim();
  const phone = profile.phone.trim().replace(/[\s()-]/g, "");
  if (!fullName || fullName.length > 100)
    throw new Error("Enter your full name (up to 100 characters).");
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone))
    throw new Error("Enter your phone number with the country code, for example +264811234567.");
  return { fullName, phone };
}
