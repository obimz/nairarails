import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Copy, Check, AlertCircle } from "lucide-react";
import { apiPost } from "../lib/apiFetch.js";

interface SignupResponse {
  merchantId: string;
  name:       string;
  apiKey:     string;
  message:    string;
}

type FormState = "idle" | "submitting" | "success" | "error";

export function OnboardingPage() {
  const navigate = useNavigate();

  const [name, setName]           = React.useState("");
  const [email, setEmail]         = React.useState("");
  const [webhookUrl, setWebhook]  = React.useState("");
  const [formState, setFormState] = React.useState<FormState>("idle");
  const [errorMsg, setErrorMsg]   = React.useState("");
  const [apiKey, setApiKey]       = React.useState("");
  const [copied, setCopied]       = React.useState(false);

  // Auto-redirect 5s after key shown
  React.useEffect(() => {
    if (formState !== "success") return;
    const t = setTimeout(() => navigate("/dashboard/overview"), 5000);
    return () => clearTimeout(t);
  }, [formState, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");
    setErrorMsg("");
    try {
      const data = await apiPost<SignupResponse>("/api/v1/merchants/signup", {
        name,
        email,
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
      });
      localStorage.setItem("nairarails_api_key", data.apiKey);
      setApiKey(data.apiKey);
      setFormState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(
        msg.toLowerCase().includes("already registered")
          ? "This email is already registered."
          : msg
      );
      setFormState("error");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent — user can copy manually
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (formState === "success") {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4">
        <div className="w-full max-w-lg">
          <div className="card-dark p-8">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 border border-green-500/30">
                <Check className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-50">You're in.</h1>
                <p className="text-sm text-slate-500">Your API key has been generated.</p>
              </div>
            </div>

            {/* Key display */}
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6">
              <p className="text-xs font-semibold text-amber-400 mb-3 flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5" />
                This is the only time your key will be shown. Copy it now.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-[#020617] px-3 py-2.5 text-xs font-mono text-green-300 border border-white/10">
                  {apiKey}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 btn-primary px-3 py-2.5 gap-1.5"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Redirecting to dashboard in 5 seconds…
            </p>
            <button
              type="button"
              onClick={() => navigate("/dashboard/overview")}
              className="btn-primary w-full justify-center gap-2 py-3"
            >
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup form ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-green-500">
            <span className="text-xl font-bold text-black">₦</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-50">Get API Access</h1>
          <p className="mt-2 text-slate-500">
            One signup. One API key. Full payment infrastructure.
          </p>
        </div>

        <div className="card-dark p-8">
          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-5">

              {/* Marketplace name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Marketplace name <span className="text-red-400">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  autoComplete="organization"
                  placeholder="e.g. Jumia Foods"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-dark"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email address <span className="text-red-400">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="dev@yourmarketplace.ng"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-dark"
                />
              </div>

              {/* Webhook URL */}
              <div>
                <label htmlFor="webhook" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Webhook URL{" "}
                  <span className="text-xs font-normal text-slate-600">(optional)</span>
                </label>
                <input
                  id="webhook"
                  type="url"
                  autoComplete="url"
                  placeholder="https://yourapp.ng/webhooks/nairarails"
                  value={webhookUrl}
                  onChange={(e) => setWebhook(e.target.value)}
                  className="input-dark"
                />
                <p className="mt-1.5 text-xs text-slate-600">
                  NairaRails will POST a{" "}
                  <code className="font-mono text-green-500/80">payment.classified</code>{" "}
                  event here when each payment is processed.
                </p>
              </div>

              {/* Error */}
              {formState === "error" && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {errorMsg}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={formState === "submitting" || !name.trim() || !email.trim()}
                className="btn-primary w-full justify-center gap-2 py-3 text-base"
              >
                {formState === "submitting" ? "Creating your account…" : "Get my API key"}
                {formState !== "submitting" && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-slate-600">
            Already have a key?{" "}
            <button
              type="button"
              onClick={() => navigate("/dashboard/overview")}
              className="text-green-500 hover:text-green-400 transition-colors cursor-pointer"
            >
              Go to dashboard
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
