require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const {
  NIRAX_LOGIN,
  NIRAX_PASSWORD,
  NIRAX_BASE_URL = 'https://web.nirax.ru/cross/api/v3',
  PORT = 4000,
} = process.env;

if (!NIRAX_LOGIN || !NIRAX_PASSWORD) {
  throw new Error('Missing NIRAX_LOGIN or NIRAX_PASSWORD environment variables');
}

const app = express();
app.use(cors());
app.use(express.json());

const niraxClient = axios.create({
  baseURL: NIRAX_BASE_URL,
  timeout: 10_000,
});

let accessTokenCache = {
  token: null,
  expiresAt: 0,
  refreshToken: null,
};

const TOKEN_EXPIRY_SKEW_MS = 30 * 1000;

function decodeJwtExp(token) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    const { exp } = JSON.parse(decoded);
    return exp ? exp * 1000 : 0;
  } catch (error) {
    return 0;
  }
}

async function login() {
  const { data } = await niraxClient.post('/auth', {
    login: NIRAX_LOGIN,
    password: NIRAX_PASSWORD,
  });

  if (data.status !== 'success' || !data.result?.accessToken) {
    throw new Error('Failed to obtain Nirax access token');
  }

  const { accessToken, refreshToken } = data.result;
  const expiresAt = decodeJwtExp(accessToken);

  accessTokenCache = {
    token: accessToken,
    refreshToken: refreshToken ?? null,
    expiresAt,
  };

  return accessToken;
}

async function refreshAccessToken() {
  if (!accessTokenCache.refreshToken) {
    return login();
  }

  try {
    const { data } = await niraxClient.post('/auth/refresh', {
      refreshToken: accessTokenCache.refreshToken,
    });

    if (data.status !== 'success' || !data.result?.accessToken) {
      throw new Error('Invalid refresh response');
    }

    const { accessToken, refreshToken } = data.result;
    const expiresAt = decodeJwtExp(accessToken);

    accessTokenCache = {
      token: accessToken,
      refreshToken: refreshToken ?? accessTokenCache.refreshToken,
      expiresAt,
    };

    return accessToken;
  } catch (error) {
    accessTokenCache = { token: null, refreshToken: null, expiresAt: 0 };
    throw error;
  }
}

async function getAccessToken() {
  const now = Date.now();
  if (accessTokenCache.token && accessTokenCache.expiresAt - TOKEN_EXPIRY_SKEW_MS > now) {
    return accessTokenCache.token;
  }

  try {
    return await refreshAccessToken();
  } catch (refreshError) {
    console.warn('Refresh token failed, obtaining new token');
    return login();
  }
}

function transformPart(part) {
  return {
    id: part.id,
    article: part.dataSupplierArticleNumber ?? part.searchCode ?? '',
    manufacturer: part.manufacturerDescription ?? '',
    name: part.productDescription ?? part.description ?? '',
  };
}

app.get('/api/search/:code', async (req, res) => {
  const { code } = req.params;

  if (!code?.trim()) {
    return res.status(400).json({ message: 'Search code is required' });
  }

  try {
    const token = await getAccessToken();
    const { data } = await niraxClient.get(`/parts/by-searchcode/${encodeURIComponent(code.trim())}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (data.status !== 'success') {
      const message = data.errorMessage || 'Unexpected response from Nirax API';
      return res.status(502).json({ message });
    }

    const items = Array.isArray(data.result) ? data.result.map(transformPart) : [];
    return res.json({ items });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 500;
      const message =
        error.response?.data?.errorMessage ||
        error.response?.data?.message ||
        error.message ||
        'Nirax API request failed';

      console.error('Nirax API error:', message);
      return res.status(status === 401 ? 502 : status).json({ message });
    }

    console.error('Unexpected error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
