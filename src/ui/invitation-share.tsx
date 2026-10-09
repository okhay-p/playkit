import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { field, secondary } from "./primitives";

export function InvitationShare({
  link,
  label,
  disabled = false,
}: {
  link: string;
  label: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState("");
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");

  async function copy() {
    setCopying(true);
    setError("");
    setCopied("");
    try {
      await navigator.clipboard.writeText(link);
      setCopied(link);
    } catch {
      setError(
        "Could not copy the link. Select it below and copy it manually.",
      );
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="my-4">
      <figure className="mb-4 flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <QRCodeSVG
          value={link}
          size={224}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#000000"
          role="img"
          aria-label="Scan to join this session"
          className="h-auto max-w-full"
        />
        <figcaption className="text-center">
          <p className="font-bold">Scan to join</p>
          <p className="text-sm text-slate-500">
            Open your camera and point it at this QR code.
          </p>
        </figcaption>
      </figure>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <label className="block font-bold">
        {label}
        <input
          className={`${field} mt-2`}
          readOnly
          value={link}
          onFocus={(event) => event.target.select()}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className={secondary}
          disabled={disabled || copying}
          onClick={() => void copy()}
        >
          Copy link
        </button>
        <p role="status" className="text-sm text-slate-600">
          {copied === link ? "Link copied" : ""}
        </p>
      </div>
    </div>
  );
}
