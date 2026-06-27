import { afterEach, describe, expect, it } from 'vitest';
import { configureNotesApi, resetNotesApi } from '../../src/client/api.js';
import { assetPreviewUrl } from '../../src/client/editor/asset-paths.js';
import { ApiClient } from '../../src/client/runtime/api-client.js';

describe('assetPreviewUrl', () => {
  afterEach(() => {
    resetNotesApi();
  });

  it('routes relative, root-relative, and absolute asset URLs through the API', () => {
    configureNotesApi(
      new ApiClient({ target: 'android', baseUrl: 'http://10.0.0.8:3210' }),
    );

    expect(assetPreviewUrl('.assets/doc-1/%E5%9B%BE%201.png')).toBe(
      'http://10.0.0.8:3210/api/assets/doc-1/%E5%9B%BE%201.png',
    );
    expect(assetPreviewUrl('/.assets/doc-1/%E5%9B%BE%201.png')).toBe(
      'http://10.0.0.8:3210/api/assets/doc-1/%E5%9B%BE%201.png',
    );
    expect(
      assetPreviewUrl('http://localhost:3210/.assets/doc-1/%E5%9B%BE%201.png'),
    ).toBe('http://10.0.0.8:3210/api/assets/doc-1/%E5%9B%BE%201.png');
  });
});
