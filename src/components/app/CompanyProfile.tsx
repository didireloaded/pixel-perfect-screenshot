import { useState } from "react";
import { useAttendance } from "@/lib/app-store";
import { uploadCompanyLogo } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CompanyProfile() {
  const d = useAttendance();
  const [name, setName] = useState(d.company.name);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section className="card-surface p-5">
      <h2 className="font-bold">Your company</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Only your company’s members can access this workspace.
      </p>
      {d.company.logoUrl && (
        <img
          src={d.company.logoUrl}
          alt={`${d.company.name} logo`}
          className="my-4 h-16 w-16 rounded-xl object-contain"
        />
      )}
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setMessage("");
          try {
            const logoPath = file ? await uploadCompanyLogo(d.company.id, file) : undefined;
            const result = await d.command("save_company_profile", {
              name,
              ...(logoPath ? { logoPath } : {}),
            });
            if (result) {
              setMessage("Company updated.");
              setFile(null);
            }
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Could not save company details.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block text-sm">
          Company name
          <Input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          Company logo · PNG, JPEG or WebP, up to 1 MB
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button disabled={saving || d.busy}>{saving ? "Saving…" : "Save company details"}</Button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </form>
      <div className="mt-5 rounded-xl bg-muted p-4">
        <p className="text-sm font-semibold">Employee registration code</p>
        <p className="mt-2 select-all break-all font-mono">{d.company.registrationCode}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Share this with your employees. They enter it with their name and phone number, then wait
          for your approval. This is not a login code.
        </p>
      </div>
    </section>
  );
}
