import { useEffect, useState } from 'react';
import { Card, CopyButton, StatusRow } from '../../components/ui';
import { api } from '../../services/api';

/** How to connect the Tiga Bridge extension, and whether it is connected right now. */
export function BridgeCard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    api.getBridgeStatus().then((s) => setConnected(s.connected)).catch(() => setConnected(null));
    api.getBridgeSetup().then((s) => setToken(s.token)).catch(() => setToken(''));
  }, []);

  return (
    <Card title="Tiga Bridge (your Edge tabs)">
      <StatusRow label="Extension" value={connected ? 'Connected' : 'Not connected'} good={!!connected} />
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink-2">
        <li>Copy the <code>bridge</code> folder to Windows, e.g. run <code>cp -r ~/projects/TIGA/bridge /mnt/c/Users/$USER/tiga-bridge</code>.</li>
        <li>In Edge open <code>edge://extensions</code>, turn on Developer mode, choose Load unpacked, pick that folder.</li>
        <li>Click the Tiga Bridge icon, paste the token below, and press Save and connect.</li>
      </ol>
      {token ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span>Token:</span> <code className="rounded bg-wash px-2 py-1">{'•'.repeat(12)}</code>
          <CopyButton text={token} label="Copy token" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-3">Set TIGA_BRIDGE_TOKEN in tiga/.env to turn the bridge on.</p>
      )}
      <p className="mt-2 text-xs text-ink-3">Closing tabs, and anything after Tiga reads a page, waits for your Confirm click.</p>
    </Card>
  );
}
