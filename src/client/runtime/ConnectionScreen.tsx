import { useState, type FormEvent } from 'react';
import { History, LoaderCircle, Server, Trash2, Wifi } from 'lucide-react';
import type { ServerProfile } from '../../shared/types.js';

interface ConnectionScreenProps {
  profiles: ServerProfile[];
  initialValue?: string;
  busy?: boolean;
  error?: string;
  settings?: boolean;
  onConnect: (address: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose?: () => void;
}

export function ConnectionScreen({
  profiles,
  initialValue = '',
  busy = false,
  error = '',
  settings = false,
  onConnect,
  onDelete,
  onClose,
}: ConnectionScreenProps) {
  const [address, setAddress] = useState(initialValue);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!address.trim() || busy) return;
    await onConnect(address.trim());
  }

  return (
    <main className={`connection-screen ${settings ? 'settings-mode' : ''}`}>
      <section className="connection-panel" aria-label="服务器连接">
        <div className="connection-brand" aria-hidden="true">
          N
        </div>
        <div className="connection-heading">
          <span className="connection-kicker">
            <Wifi size={15} /> 局域网云笔记
          </span>
          <h1>{settings ? '服务器设置' : '连接到你的电脑'}</h1>
          <p>电脑上的个人笔记服务需要保持运行，手机和电脑应连接同一局域网。</p>
        </div>

        <form className="connection-form" onSubmit={handleSubmit}>
          <label htmlFor="server-address">电脑服务器地址</label>
          <div className="server-address-field">
            <Server size={18} />
            <input
              id="server-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="http://192.168.1.10:3210"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="url"
            />
          </div>
          {error && <div className="connection-error">{error}</div>}
          <div className="connection-actions">
            {settings && onClose && (
              <button type="button" className="button secondary" onClick={onClose}>
                返回笔记
              </button>
            )}
            <button
              type="submit"
              className="button primary connect-button"
              disabled={busy || !address.trim()}
            >
              {busy ? <LoaderCircle className="spinning" size={17} /> : <Wifi size={17} />}
              {busy ? '正在测试' : '连接服务器'}
            </button>
          </div>
        </form>

        {profiles.length > 0 && (
          <div className="server-history">
            <h2>
              <History size={16} /> 最近连接
            </h2>
            <div className="server-history-list">
              {profiles.map((profile) => (
                <div className="server-profile-row" key={profile.id}>
                  <button
                    type="button"
                    className="server-profile-connect"
                    aria-label={`连接 ${profile.baseUrl}`}
                    onClick={() => void onConnect(profile.baseUrl)}
                    disabled={busy}
                  >
                    <Server size={17} />
                    <span>
                      <strong>{profile.baseUrl}</strong>
                      <small>
                        {new Date(profile.lastConnectedAt).toLocaleString('zh-CN')}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="server-profile-delete"
                    aria-label={`删除 ${profile.baseUrl}`}
                    data-tooltip="删除地址"
                    onClick={() => void onDelete(profile.id)}
                    disabled={busy}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
