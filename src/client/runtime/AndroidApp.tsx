import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { LoaderCircle } from 'lucide-react';
import type { ServerProfile } from '../../shared/types.js';
import { App, type AppHandle } from '../App.js';
import { configureNotesApi } from '../api.js';
import { GlobalTooltip } from '../components/GlobalTooltip.js';
import { ApiClient } from './api-client.js';
import { ConnectionScreen } from './ConnectionScreen.js';
import {
  PreferencesProfileStore,
  rememberServerProfile,
  testServerConnection,
} from './server-profiles.js';
import {
  initializeNativeUi,
  minimizeNativeApp,
  nativeAppEvents,
} from './native-ui.js';

export function AndroidApp() {
  const store = useMemo(() => new PreferencesProfileStore(Preferences), []);
  const appRef = useRef<AppHandle>(null);
  const settingsOpenRef = useRef(false);
  const [profiles, setProfiles] = useState<ServerProfile[]>([]);
  const [activeUrl, setActiveUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  const activateServer = useCallback(
    async (input: string) => {
      setBusy(true);
      setError('');
      try {
        const { baseUrl } = await testServerConnection(input);
        const nextProfiles = await rememberServerProfile(store, baseUrl);
        await store.setActive(baseUrl);
        configureNotesApi(new ApiClient({ target: 'android', baseUrl }));
        setProfiles(nextProfiles);
        setActiveUrl(baseUrl);
        setReady(true);
        setSettingsOpen(false);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : '无法连接到电脑服务器';
        setError(`连接失败：${message}`);
      } finally {
        setBusy(false);
      }
    },
    [store],
  );

  useEffect(() => {
    let cancelled = false;
    void initializeNativeUi();
    void Promise.all([store.list(), store.getActive()])
      .then(async ([savedProfiles, savedActive]) => {
        if (cancelled) return;
        setProfiles(savedProfiles);
        if (!savedActive) return;
        try {
          const { baseUrl } = await testServerConnection(savedActive);
          if (cancelled) return;
          configureNotesApi(new ApiClient({ target: 'android', baseUrl }));
          setActiveUrl(baseUrl);
          setReady(true);
        } catch {
          if (!cancelled) {
            setError('上次使用的电脑服务器当前无法连接，请检查服务和局域网。');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    let disposed = false;
    let removeListener: (() => Promise<void>) | undefined;
    void nativeAppEvents
      .addListener('backButton', () => {
        if (settingsOpenRef.current) {
          setSettingsOpen(false);
          return;
        }
        if (appRef.current?.handleBack()) return;
        void minimizeNativeApp();
      })
      .then((listener) => {
        if (disposed) {
          void listener.remove();
          return;
        }
        removeListener = () => listener.remove();
      });
    return () => {
      disposed = true;
      void removeListener?.();
    };
  }, []);

  async function removeProfile(id: string) {
    await store.removeProfile(id);
    setProfiles(await store.list());
  }

  if (loading) {
    return (
      <main className="native-loading">
        <div className="connection-brand" aria-hidden="true">
          N
        </div>
        <LoaderCircle className="spinning" size={24} />
        <span>正在读取服务器配置</span>
      </main>
    );
  }

  if (!ready || settingsOpen) {
    return (
      <>
        <ConnectionScreen
          profiles={profiles}
          initialValue={activeUrl}
          busy={busy}
          error={error}
          settings={settingsOpen}
          onConnect={activateServer}
          onDelete={removeProfile}
          onClose={ready ? () => setSettingsOpen(false) : undefined}
        />
        <GlobalTooltip />
      </>
    );
  }

  return (
    <App
      key={activeUrl}
      ref={appRef}
      onOpenServerSettings={() => {
        setError('');
        setSettingsOpen(true);
      }}
    />
  );
}
