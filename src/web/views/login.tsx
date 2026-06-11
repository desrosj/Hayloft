import type { FC } from "hono/jsx";
import { Layout } from "./layout.js";

interface LoginProps {
  error?: string;
  next?: string;
}

export const Login: FC<LoginProps> = ({ error, next }) => {
  return (
    <Layout title="Sign in">
      <div class="min-h-[calc(100vh-6rem)] flex items-center justify-center px-6 py-12">
        <div class="w-full max-w-sm">
          <div class="text-center mb-8">
            <div class="font-display font-bold text-4xl tracking-tight text-ink">
              hayloft
              <span class="text-accent">.</span>
            </div>
            <div class="label-eyebrow mt-2">Keep your Harvest</div>
            <p class="text-sm text-slate mt-3">
              Read-only access to your archived Harvest data.
            </p>
          </div>

          <form method="post" action="/login" class="card p-6 space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div>
              <label class="field-label" for="password">Team password</label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                autofocus
                class="field-input"
              />
            </div>

            {error && (
              <div class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" class="btn-primary w-full">
              Sign in
            </button>
          </form>

          <p class="text-xs text-slate text-center mt-6">
            Forgot the password? Ask your administrator.
          </p>
        </div>
      </div>
    </Layout>
  );
};
