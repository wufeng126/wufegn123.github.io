import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';

let envLoaded = false;
let credentialsMissingLogged = false;

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

function loadEnv(): void {
  if (envLoaded || (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)) {
    return;
  }

  try {
    try {
      require('dotenv').config();
      if (process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

// Placeholder credentials used when env vars are not configured.
// This allows the Next.js build to succeed without Supabase env vars —
// actual API calls will fail at runtime with auth errors if not configured.
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder';

function getSupabaseCredentials(): SupabaseCredentials {
  loadEnv();

  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (!credentialsMissingLogged) {
      console.log('[supabase] COZE_SUPABASE_URL:', url ? `${url.substring(0, 50)}...` : 'NOT SET');
      console.log('[supabase] COZE_SUPABASE_ANON_KEY:', anonKey ? `${anonKey.substring(0, 20)}...` : 'NOT SET');
      console.log('[supabase] Using placeholder credentials — API calls will fail until env vars are configured');
      credentialsMissingLogged = true;
    }
    return { url: PLACEHOLDER_URL, anonKey: PLACEHOLDER_KEY };
  }

  return { url, anonKey };
}

// Singleton cache for the default (no-token) client
let _defaultClient: SupabaseClient | null = null;
let _defaultClientUrl: string | null = null;
let _defaultClientKey: string | null = null;

function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  // For default client (no token), reuse singleton (but invalidate if credentials change)
  if (!token) {
    if (!_defaultClient || _defaultClientUrl !== url || _defaultClientKey !== anonKey) {
      _defaultClient = createClient(url, anonKey, {
        db: {
          timeout: 60000,
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      _defaultClientUrl = url;
      _defaultClientKey = anonKey;
    }
    return _defaultClient;
  }

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
    db: {
      timeout: 60000,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export { loadEnv, getSupabaseCredentials, getSupabaseClient };
