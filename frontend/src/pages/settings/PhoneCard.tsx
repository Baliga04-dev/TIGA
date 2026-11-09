import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, CopyButton, Notice } from '../../components/ui';
import { api } from '../../services/api';
import type { PhonePairing } from '../../types';

/**
 * The phone remote: when music drowns out the PC's microphone, the owner talks to Tiga from their phone on the same
 * Wi-Fi. The QR code carries the pairing code; a new code locks out any phone paired with the old one.
 */
export function PhoneCard() {
  const [info, setInfo] = useState<PhonePairing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getPhonePairing().then(setInfo).catch((e: Error) => setError(e.message));
  }, []);

  const renew = async () => {
    setBusy(true);
    try {
      setInfo(await api.newPhoneCode());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make a new code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Phone remote">
      <p className="text-sm text-ink-2">
        Control music and volume and give Tiga commands from your phone, for when something is playing and the PC's
        microphone can't hear you.
      </p>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      {!info && !error && <div aria-busy="true" aria-label="Loading the phone remote" className="mt-3 h-24 animate-pulse rounded bg-wash" />}
      {info && !info.enabled && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
          <li>Add <code>TIGA_PHONE=on</code> to <code>tiga/.env</code>.</li>
          <li>Once, in PowerShell opened as administrator, run <code>phone_setup.ps1</code> from the TIGA folder. It lets
            your Wi-Fi reach Tiga in WSL.</li>
          <li>Restart WSL (<code>wsl --shutdown</code>), then start Tiga again. A QR code appears here.</li>
        </ol>
      )}
      {info?.enabled && (
        <div className="mt-3 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          {/* The QR code is Tiga's own SVG (billing.qr_svg), drawn from the pairing link. */}
          <div className="w-40 rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" role="img"
            aria-label="QR code: scan it with your phone's camera" dangerouslySetInnerHTML={{ __html: info.qr_svg ?? '' }} />
          <div className="min-w-0 space-y-2 text-sm">
            <p>Scan it with your phone's camera, on the same Wi-Fi as this PC. Then add the page to your home screen.</p>
            <p className="text-ink-2">{info.hint}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={info.url ?? ''} label="Copy the phone link" />
              <button className="btn btn-ghost btn-sm" onClick={renew} disabled={busy}>
                <RefreshCw className="size-4" aria-hidden="true" /> New pairing code
              </button>
            </div>
            <p className="text-xs text-ink-3">A new code unpairs the phone that has the old one. Anything that needs your
              click on the PC needs a tap on the phone too, never just a voice command.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
