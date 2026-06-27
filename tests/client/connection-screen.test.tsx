// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionScreen } from '../../src/client/runtime/ConnectionScreen.js';

const profile = {
  id: 'http://192.168.1.8:3210',
  baseUrl: 'http://192.168.1.8:3210',
  lastConnectedAt: '2026-06-25T08:00:00.000Z',
};

describe('ConnectionScreen', () => {
  it('connects to an entered address and can switch or delete history', async () => {
    const onConnect = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <ConnectionScreen
        profiles={[profile]}
        onConnect={onConnect}
        onDelete={onDelete}
      />,
    );

    await userEvent.type(
      screen.getByLabelText('电脑服务器地址'),
      '10.0.0.8:3210',
    );
    await userEvent.click(screen.getByRole('button', { name: '连接服务器' }));
    expect(onConnect).toHaveBeenCalledWith('10.0.0.8:3210');

    await userEvent.click(
      screen.getByRole('button', { name: '连接 http://192.168.1.8:3210' }),
    );
    expect(onConnect).toHaveBeenCalledWith('http://192.168.1.8:3210');

    await userEvent.click(
      screen.getByRole('button', { name: '删除 http://192.168.1.8:3210' }),
    );
    expect(onDelete).toHaveBeenCalledWith(profile.id);
  });
});
